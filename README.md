# OLS: One-Liner Serverless runtime

Launch always-up-to-date backends in one line like it's 2009 again.

## Hello World Example

1. Launch example repo:
```bash
docker run -p 9000:9000 -e OLS_REPO="https://github.com/zlumer/ols.git" -e OLS_WORKERS_ROOT="/routes" ols
```

2. Check that the runtime is running and workers execute:
```bash
curl http://localhost:9000/hello?name=Alice
```
Or just open http://localhost:9000/hello in the browser.

## Usage

### Local Dev Mode

Local dev mode automatically reloads all workers on every request.

To enable dev mode, pass `OLS_DEV_MODE=1` in env and make sure to remove `OLS_REPO`.

```bash
docker run -it --rm -p 9000:9000 -e OLS_DEV_MODE=1 -v ./routes:/app/workdir ols
```

### Production

OLS is in an early alpha release, but it is ultimately meant for production use.
The philosophy of OLS is "launch and forget", meaning that you run a single command on your remote machine and never have to maintain it anymore.

Production checklist:
1. Make sure that you provide `OLS_REPO` and not `OLS_DEV_MODE`.
2. Set `OLS_WORKERS_ROOT` and `OLS_BRANCH_NAME` to production values.
3. Update `OLS_POLLING_INTERVAL` to an appropriate value (the default `65` is optimized for GitHub).
4. Test that the workers are responding.

### Dev/Staging/Production Environments

<TODO>

## Scalability

OLS instances should generally be stateless, meaning that you can launch as much of them as you want.

If you launch multiple OLS instances, you'll need a load balancer on top of it. Nginx works perfectly for a single-location scalability.

If you launch in multiple geographical regions, you'll need your load balancer to automatically find the closest instance to the user.
[Cloudflare Load Balancer geo steering](https://developers.cloudflare.com/load-balancing/understand-basics/traffic-steering/steering-policies/geo-steering/) can help with that.
However, if you find yourself maintaining multiple OLS regions, it might be time for you to switch to the edge serverless such as [Cloudflare Workers](https://workers.cloudflare.com/).

## How does it work?

<TODO> (basically a simple HTTP router on top of Supabase Edge Runtime/Deno and a git polling job)

## Credits

OLS is based on [Supabase Edge Runtime](https://github.com/supabase/edge-runtime) which is based on [Deno](https://github.com/denoland/deno).
