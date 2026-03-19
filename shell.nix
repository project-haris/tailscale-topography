{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs_20
    tailscale
  ];

  shellHook = ''
    export HOST="''${HOST:-127.0.0.1}"
    export PORT="''${PORT:-4180}"
    export TAILSCALE_TIMEOUT_MS="''${TAILSCALE_TIMEOUT_MS:-12000}"

    echo "tailscale-topography dev shell"
    echo "Node: $(node --version)"
    echo "Tailscale: $(tailscale version | head -n 1)"
    echo "Run with: node server.js"
  '';
}
