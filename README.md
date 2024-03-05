# OLS: One-Liner Serverless runtime

Launch always-up-to-date backends in one line of code like it's 2009 again.

## Motivation

OLS is a self-hosted serverless Deno runtime with automatic live-reload from a git repository.
The basic idea is that you run a single command on your production server and never have to maintain it anymore.

OLS is meant for small to medium-sized projects that don't want to or can't afford to maintain complex infrastructure with advanced GitOps.

## Hello World

1. Launch with an example repo:
```bash
docker run -p 9000:9000 -e OLS_REPO="https://github.com/zlumer/ols.git" -e OLS_WORKERS_ROOT="/routes" zlumer/ols:latest
```

2. Check that the runtime is running and workers execute:
```bash
curl http://localhost:9000/hello?name=Alice
```
Or open http://localhost:9000/hello in the browser.

## What's under the hood?

OLS is a Deno runtime with an HTTP router on top of it.
It automatically pulls from a git repository under a specified branch, making sure that you're always running the latest version of your code in production.

You can write your own workers in Deno and they will be automatically executed by OLS.

## Usage

### Local Dev Mode

Local dev mode automatically reloads all workers on every request.

To enable dev mode, pass `OLS_DEV_MODE=1` in env and make sure to remove `OLS_REPO`.

```bash
docker run -it --rm -p 9000:9000 -e OLS_DEV_MODE=1 -v ./routes:/app/workdir zlumer/ols:latest
```

### Production

OLS is in an early alpha release, but it is ultimately meant for production use.
The philosophy of OLS is "launch and forget", meaning that you run a single command on your remote machine and never have to maintain it anymore.

Production checklist:
1. You would probably use `--env-file` instead of `-e` to pass the environment variables.
2. Always tag a specific version of OLS Docker image, not `latest`. E.g. `zlumer/ols:v0.0.1`
3. Set Docker restart policy to `unless-stopped` or use Docker Compose.
4. Set up a reverse proxy (e.g. Nginx) to handle SSL and other HTTP features.

Environment variables:
1. Make sure that you provide `OLS_REPO` and not `OLS_DEV_MODE`.
2. Set `OLS_WORKERS_ROOT` and `OLS_BRANCH_NAME` to production values.
3. Update `OLS_POLLING_INTERVAL` to an appropriate value (the default `65` is optimized for GitHub).

Test that the workers are responding after OLS is launched.
Set up an uptime monitor to periodically check that the OLS instance is running.

```bash
docker run -d --restart unless-stopped --rm -p 9000:9000 --env-file ./.env zlumer/ols:v0.0.1
```

### Docker Compose

```yaml
<TODO>
```

### Dev/Staging/Production Environments

<TODO>

tldr: Use different branches and environment variables to manage different environments.

## Scalability

OLS instances should generally be stateless, meaning that you can launch as much of them as you want.

If you launch multiple OLS instances, you'll need a load balancer on top of it. Nginx works perfectly for a single-location scalability.

If you launch in multiple geographical regions, you'll need your load balancer to automatically find the closest instance to the user.
[Cloudflare Load Balancer geo steering](https://developers.cloudflare.com/load-balancing/understand-basics/traffic-steering/steering-policies/geo-steering/) can help with that.
However, if you find yourself maintaining multiple OLS regions, it might be time for you to switch to the edge serverless such as [Cloudflare Workers](https://workers.cloudflare.com/).

## How does it work?

<TODO> (basically a simple HTTP router on top of Supabase Edge Runtime/Deno and a git polling job)

## Why?
To set up a modern backend in 2024 you have two main options:

1. Use a cloud provider's serverless offering (Cloudflare Workers, Deno Deploy, Vercel Functions, etc). This is usually a great choice, but there are certain drawbacks:
	- vendor lock-in, meaning that you can't easily switch to another provider or your own infrastructure
	- serverless costs might get [extremly high](https://serverlesshorrors.com/), especially during surges in traffic
	- you still have to set up a CI/CD pipeline to deploy your code
	- with the exception of Cloudflare, almost no clouds provide a good worldwide geographical coverage, meaning that you might not have a serverless instance close to your users; this is especially true in remote areas where even Cloudflare doesn't have a data center

2. Alternatively, you can set up your own infrastructure. An example of such a setup is:
	- GitHub Actions to build and push Docker images
	- Docker Hub or ghcr.io to store Docker images
	- Docker Compose or Kubernetes to run the containers
	- set up container registry secrets in your CI/CD
	- set up k8s ingress for routing
	- you pay for basically every step above: CI/CD minutes, Docker Hub, k8s control plane, etc.
	- maintaining separate dev/staging/production environments adds complexity
	- due to CI/CD pipeline and container restart times it is not uncommon to have a 15-30 minutes delay between pushing a commit with a single line fix and seeing the changes live

If this sounds like a crazy amount of work for a simple backend, it's because it is.

With OLS you get the serverless experience without the drawbacks of vendor lock-in and [serverless horrors](https://serverlesshorrors.com/).

And the best part is that if you decide to move to k8s when your team expands, you can launch OLS in your k8s cluster and it will work just fine.

## Limitations

Workers cannot access file system.

## TODO

- [ ] Blue/green deployments
- [ ] Separate env vars source for workers
- [ ] Manifest file to replace CLI args
- [ ] Shorter launch command (e.g. `yarn ols:launch` or `./ols.sh <path to manifest>`)
- [ ] Docs: Docker Compose example
- [ ] Docs: DB connection example
- [ ] Docs: Dev/Staging/Production Environments example
- [ ] Docs: how to write workers
- [ ] Docs: how to set up a reverse proxy & SSL
- [ ] Docs: how to set up a custom domain

## Credits

OLS is based on [Supabase Edge Runtime](https://github.com/supabase/edge-runtime) which is based on [Deno](https://github.com/denoland/deno).
