#!/usr/bin/env bash
# Checks the input-handling guarantees: slug validation, path traversal,
# XSS-capable characters, self-referencing destinations (redirect loops),
# dangerous URL schemes, header injection and CSRF.
#
#   scripts/security-test.sh                       # against `npx wrangler dev`
#   scripts/security-test.sh https://updog.link    # against production
#
# Safe to run against production: submissions that *should* be accepted are
# stopped by the Turnstile check before anything is written, so no links are
# created. Locally the dummy Turnstile secret always passes, so those same
# cases create a link in the local bucket instead. Both outcomes count as pass.

set -uo pipefail
BASE="${1:-http://localhost:8787}"
pass=0
fail=0

# A deployed instance rate limits link creation (5 per 10s by default), which
# would otherwise turn most of this suite into 429s. Pace the writes when the
# target isn't a local dev server. Override with THROTTLE=<seconds>.
case "$BASE" in
  *localhost* | *127.0.0.1*) THROTTLE="${THROTTLE:-0}" ;;
  *) THROTTLE="${THROTTLE:-2.5}" ;;
esac

post() {
  [ "$THROTTLE" != "0" ] && sleep "$THROTTLE"
  curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST "$BASE/api/links" \
    -H 'content-type: application/json' -d "$1"
}
payload() { printf '{"slug":"%s","destination":"%s","token":"x"}' "$1" "$2"; }

# expect an exact status
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); printf '  ok    %-50s %s\n' "$1" "$3"
  else fail=$((fail + 1)); printf '  FAIL  %-50s got %s want %s\n' "$1" "$3" "$2"; fi
}
# expect one of two acceptable refusals
chk_either() {
  if [ "$4" = "$2" ] || [ "$4" = "$3" ]; then pass=$((pass + 1)); printf '  ok    %-50s %s\n' "$1" "$4"
  else fail=$((fail + 1)); printf '  FAIL  %-50s got %s want %s or %s\n' "$1" "$4" "$2" "$3"; fi
}
# expect the input to be *accepted* by validation: created (201), stopped by the
# bot check (403), already taken (409), or rate limited (429)
chk_ok() {
  case "$2" in
    201 | 403 | 409 | 429) pass=$((pass + 1)); printf '  ok    %-50s %s\n' "$1" "$2" ;;
    *) fail=$((fail + 1)); printf '  FAIL  %-50s got %s want accepted\n' "$1" "$2" ;;
  esac
}

echo "Testing $BASE"
echo "-- slug validation --"
chk "traversal ../"             400 "$(post "$(payload '../secret' 'https://example.com')")"
chk "traversal percent-encoded" 400 "$(post "$(payload '%2e%2e%2fsecret' 'https://example.com')")"
chk "forward slash"             400 "$(post "$(payload 'a/b' 'https://example.com')")"
chk "backslash"                 400 "$(post "$(payload 'a\\b' 'https://example.com')")"
chk "dot"                       400 "$(post "$(payload 'file.html' 'https://example.com')")"
chk "angle brackets"            400 "$(post "$(payload '<script>' 'https://example.com')")"
chk "single quote"              400 "$(post "$(payload "a'b" 'https://example.com')")"
chk "non-ascii"                 400 "$(post "$(payload 'héllo' 'https://example.com')")"
chk "space"                     400 "$(post "$(payload 'a b' 'https://example.com')")"
chk_ok "empty means auto-name"      "$(post "$(payload '' 'https://example.com')")"
chk "over 64 chars"             400 "$(post "$(payload "$(printf 'a%.0s' $(seq 65))" 'https://example.com')")"
chk "leading hyphen"            400 "$(post "$(payload '-lead' 'https://example.com')")"
chk "reserved: api"             400 "$(post "$(payload 'api' 'https://example.com')")"
chk "reserved: admin"           400 "$(post "$(payload 'admin' 'https://example.com')")"
chk_ok "exactly 64 chars"           "$(post "$(payload "$(printf 'a%.0s' $(seq 64))" 'https://example.com')")"
chk_ok "letters digits _ -"         "$(post "$(payload "ok_test-9$RANDOM" 'https://example.com')")"

echo "-- destination: must never point back at this service --"
host="$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*##; s#:.*##')"
chk "own host"                  400 "$(post "$(payload "loop1$RANDOM" "https://$host/x")")"
chk "own host, trailing dot"    400 "$(post "$(payload "loop2$RANDOM" "https://$host./x")")"
chk "own host, repeated dots"   400 "$(post "$(payload "loop3$RANDOM" "https://$host../x")")"
chk "own host, uppercased"      400 "$(post "$(payload "loop4$RANDOM" "https://$(printf '%s' "$host" | tr '[:lower:]' '[:upper:]')./x")")"
chk "own host via userinfo"     400 "$(post "$(payload "loop5$RANDOM" "https://evil.example.com@$host/x")")"
chk_ok "lookalike is not us"        "$(post "$(payload "look$RANDOM" "https://$host.evil.example.com/x")")"

echo "-- destination: schemes and injection --"
chk "javascript:"               400 "$(post "$(payload "s1$RANDOM" 'javascript:alert(1)')")"
chk "data:"                     400 "$(post "$(payload "s2$RANDOM" 'data:text/html,<script>')")"
chk "file:"                     400 "$(post "$(payload "s3$RANDOM" 'file:///etc/passwd')")"
chk "CRLF header injection"     400 "$(post "$(printf '{"slug":"s4%s","destination":"https://e.com/\\r\\nX-Injected: 1","token":"x"}' "$RANDOM")")"
chk "not a URL"                 400 "$(post "$(payload "s5$RANDOM" 'notaurl')")"

echo "-- CSRF --"
ct() {
  [ "$THROTTLE" != "0" ] && sleep "$THROTTLE"
  curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST "$BASE/api/links" -H "content-type: $1" --data "$2"
}
chk "form-urlencoded rejected"  415 "$(ct 'application/x-www-form-urlencoded' 'x=1')"
chk "text/plain rejected"       415 "$(ct 'text/plain' '{"slug":"a","destination":"https://e.com","token":"x"}')"
# No CORS headers are ever sent, so a denied preflight blocks the browser from
# making a cross-origin write regardless.
chk "OPTIONS preflight denied"  405 "$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X OPTIONS "$BASE/api/links")"
chk "no CORS on write endpoint"  "" "$(curl -si -m 15 -X OPTIONS "$BASE/api/links" | grep -ci 'access-control-allow-origin' | sed 's/^0$//')"

echo "-- API surface --"
get() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$1"; }
meth() { curl -s -o /dev/null -m 15 -w '%{http_code}' -X "$1" "$2"; }
chk "GET collection describes itself"  200 "$(get "$BASE/api/links")"
chk "lookup: traversal"                400 "$(get "$BASE/api/links/..%2fsecret")"
chk "lookup: slash in slug"            400 "$(get "$BASE/api/links/a/b")"
chk "lookup: angle brackets"           400 "$(get "$BASE/api/links/%3Cscript%3E")"
chk "lookup: reserved name"            400 "$(get "$BASE/api/links/api")"
chk "lookup: unknown slug"             404 "$(get "$BASE/api/links/definitely-not-here")"
chk "PUT is an inactive stub"          501 "$(meth PUT "$BASE/api/links/anything")"
chk "DELETE is an inactive stub"       501 "$(meth DELETE "$BASE/api/links/anything")"
chk "POST to an item rejected"         405 "$(meth POST "$BASE/api/links/anything")"
chk "DELETE on collection rejected"    405 "$(meth DELETE "$BASE/api/links")"
chk "unknown /api path"                404 "$(get "$BASE/api/nope")"

echo "-- read path --"
chk "traversal on GET"          404 "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$BASE/../etc/passwd")"
# Cloudflare's edge rejects percent-encoded traversal with a 400 before the
# Worker runs; locally it reaches the Worker and 404s. Either is a refusal.
chk_either "encoded traversal on GET" 400 404 "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$BASE/%2e%2e%2f%2e%2e%2fetc")"
chk "nested path"               404 "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$BASE/a/b/c")"

echo
echo "  $pass passed, $fail failed"
exit $((fail > 0))
