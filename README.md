# What's Updog.link? 🐶

Updog.link is an ad-free, open-source URL shortener that anyone can deploy and run.
Make a link at [whats.updog.link](https://whats.updog.link); shortlinks live at `updog.link/<slug>`.

## Why does this exist?

Aside from being a free shortlink service with a _[sick](https://www.urbandictionary.com/define.php?term=Sick)_ name,
this project is a compact intro to Infrastructure as Code and serverless cloud technologies. Also you get to have your
own shortlink service. It doesn't collect information to track you or anyone else.

## Run your own

It's one Cloudflare Worker and one R2 bucket, deployed with Terraform, and fits entirely in Cloudflare's free tier.
See [SELF_HOSTING.md](SELF_HOSTING.md) for how it works and the ten-minute setup.

## Is there an API?

Yes — the page is just a client of it.

```sh
curl https://updog.link/api/links/github
```

See [the API docs](SELF_HOSTING.md#the-api) for creating links and the rest of the resource.

## But no, really, what is "Updog?"

[Nothin' much. What's up with you?](https://knowyourmeme.com/memes/updog)

## License

[MIT](LICENSE). Fork it, run your own, do what you like.
