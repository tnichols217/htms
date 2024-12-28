{
  lib,
  flake-root,
  gitignoreSource,
  stdenv,
  bun,
}:
let
  src = gitignoreSource flake-root;

  packageJson = lib.importJSON "${src}/package.json";
  version = packageJson.version;
  pname = packageJson.name;

  node_modules = stdenv.mkDerivation {
    pname = "${pname}_node-modules";
    inherit src version;

    nativeBuildInputs = [ bun ];
    # buildInputs = [ nodejs-slim_latest ];

    dontConfigure = true;
    dontFixup = true; # patchShebangs produces illegal path references in FODs

    buildPhase = ''
      runHook preBuild

      export HOME=$TMPDIR

      bun install --no-progress --frozen-lockfile --no-cache

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/node_modules
      mv node_modules $out/

      runHook postInstall
    '';

    outputHash = if stdenv.isLinux then "sha256-Y9IqD8TI04NX0I4/1DyQsM+aLyF9gNzArJzT5X3j00E=" else "";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };
in
stdenv.mkDerivation {
  inherit pname version src;

  nativeBuildInputs = [
    node_modules
    # nodejs-slim_latest
    bun
  ];

  configurePhase = ''
    runHook preConfigure

    cp -a ${node_modules}/node_modules ./node_modules
    chmod -R u+rw node_modules
    chmod -R u+x node_modules/.bin
    patchShebangs node_modules

    export HOME=$TMPDIR
    export PATH="$PWD/node_modules/.bin:$PATH"

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild

    bun build index.ts --target bun --minify --outfile index.js

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin
    cp ./index.js $out/bin/index.js

    runHook postInstall
  '';
}