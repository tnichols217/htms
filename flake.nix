{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    treefmt-nix.url = "github:numtide/treefmt-nix";
  };
  outputs = {...} @ inputs:
    inputs.flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = (import inputs.nixpkgs) {
          inherit system;
          config = {
            allowUnfree = true;
          };
        };
      in {
        devShells = rec {
          docker-python = pkgs.mkShell {
            packages = with pkgs; [
              docker-compose
              docker
              podman-compose
              podman
              # nodejs_23
              bun
            ];
          };
          default = docker-python;
        };
        formatter = let
          treefmtconfig = inputs.treefmt-nix.lib.evalModule pkgs {
            projectRootFile = "flake.nix";
            programs = {
              alejandra.enable = true;
              black.enable = true;
              toml-sort.enable = true;
              yamlfmt.enable = true;
              mdformat.enable = true;
              prettier.enable = true;
              shellcheck.enable = true;
              shfmt.enable = true;
            };
            settings.formatter.shellcheck.excludes = [".envrc"];
          };
        in
          treefmtconfig.config.build.wrapper;
        apps = rec {
        };
      }
    );
}
