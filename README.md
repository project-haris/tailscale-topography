# Tailscale Topography

A small local website that visualizes the current Tailscale node and its peers by reading:

```sh
tailscale status --json
```

The app is intended to run on a machine that is already joined to your tailnet and has `tailscaled` running.

## What it shows

- local node identity
- peer inventory
- direct vs DERP-relayed connectivity
- tags, OS, primary Tailscale IPs, and traffic counters
- a simple radial topology view generated in the browser

## Requirements

- Node.js 18+ on the host that will run the site
- `tailscale` CLI installed
- `tailscaled` running and authenticated into your tailnet

## Run

```sh
cd tailscale-topography
node server.js
```

Then open `http://127.0.0.1:4180`.

Environment variables:

- `HOST` - bind address, default `0.0.0.0`
- `PORT` - listen port, default `4180`
- `TAILSCALE_TIMEOUT_MS` - CLI timeout in milliseconds, default `12000`
- `TAILSCALE_BIN` - path to the `tailscale` binary, default `tailscale`
- `TAILSCALE_SOCKET` - optional path to the `tailscaled` socket

## NixOS / nix-shell

This repo includes [shell.nix](/home/ahmed/maritime/tailscale-topography/shell.nix) for a simple development shell on NixOS systems.

Enter the shell:

```sh
cd tailscale-topography
nix-shell
```

Then run the app:

```sh
node server.js
```

The shell provides:

- `nodejs_20`
- `tailscale`

## Run as a service

A sample systemd unit is included at:

```text
tailscale-topography.service
```

Typical install flow on the target host:

```sh
sudo mkdir -p /opt/tailscale-topography
sudo cp -r . /opt/tailscale-topography
sudo cp tailscale-topography.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tailscale-topography
```

## Publish inside the tailnet

For safer exposure, keep this app bound to `127.0.0.1` and publish it with Tailscale itself:

```sh
sudo tailscale serve http://127.0.0.1:4180
```

## Docker

This repo now includes a `Dockerfile` and `docker-compose.yml`.

The container does not run its own Tailscale daemon. Instead, it uses the host's existing `tailscaled` instance by mounting the host socket at `/var/run/tailscale/tailscaled.sock`.

On firewalld-managed hosts such as `haris-citadel`, the compose file uses `network_mode: host` to avoid Docker bridge creation and errors like `INVALID_ZONE: docker`.

Start it with:

```sh
docker compose up -d --build
```

Then reach it from any device in the same tailnet using the host's Tailscale IP or MagicDNS name, for example:

```text
http://100.x.y.z:4180
http://your-hostname.your-tailnet.ts.net:4180
```

Notes:

- The host machine must already be connected to Tailscale.
- `docker-compose.yml` uses the host network, and the app binds to `0.0.0.0`, so it is reachable through the host's Tailscale interface on port `4180`.
- If `haris-citadel` should allow access from other Tailscale nodes, firewalld must allow TCP `4180` on the `tailscale` zone.
- If you only want tailnet exposure and not general LAN exposure, bind the app to `127.0.0.1` and publish it with `tailscale serve` on the host instead.

## Notes

- The UI reads live topology from the local node only. It does not need an API key.
- If `/api/topology` fails, check `tailscale status --json` manually on the host.
- On this development machine, `tailscale` is installed but `tailscaled` is not running, so live data could not be verified here.
