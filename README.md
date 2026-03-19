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

Then open:

```text
http://127.0.0.1:4180
```

Environment variables:

- `HOST` - bind address, default `127.0.0.1`
- `PORT` - listen port, default `4180`
- `TAILSCALE_TIMEOUT_MS` - CLI timeout in milliseconds, default `12000`

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

## Notes

- The UI reads live topology from the local node only. It does not need an API key.
- If `/api/topology` fails, check `tailscale status --json` manually on the host.
- On this development machine, `tailscale` is installed but `tailscaled` is not running, so live data could not be verified here.
