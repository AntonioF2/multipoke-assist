"""Empacota o MultiPoke Assist e envia versões à Chrome Web Store API v2."""

import argparse
import json
import os
from pathlib import Path
import re
import sys
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
API = "https://chromewebstore.googleapis.com"
FILES = ("ativar.html", "ativar.js", "autocaptura.js", "dados-hunts.js", "combate-hunts.js", "analise-hunts.js", "troca-hunts.js", "testes-hunts.js", "tierlist.js", "loja.js", "barra.js", "banco-hunts.js", "dragonite.png", "icone-128.png")
UPLOAD_RUNNING = {"IN_PROGRESS", "UPLOAD_IN_PROGRESS"}


def version_parts(version):
    if not isinstance(version, str) or not re.fullmatch(r"(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){0,3}", version):
        raise ValueError(f"Versão inválida: {version}")
    parts = tuple(map(int, version.split(".")))
    if not any(parts) or max(parts) > 65535:
        raise ValueError(f"Versão inválida: {version}")
    return parts + (0,) * (4 - len(parts))


def package(output):
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version_parts(manifest["version"])
    # A loja atribui o ID. A chave local continua disponível para o lançador de desenvolvimento.
    manifest.pop("key", None)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        for filename in FILES:
            archive.write(ROOT / filename, filename)
    print(f"Pacote {manifest['version']} criado em {output}.")


def request(url, token, data=None, content_type=None):
    headers = {"Authorization": f"Bearer {token}"}
    if content_type:
        headers["Content-Type"] = content_type
    try:
        with urlopen(Request(url, data=data, headers=headers), timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            message = json.load(error).get("error", {}).get("message", error.reason)
        except ValueError:
            message = error.reason
        raise RuntimeError(f"Chrome Web Store retornou HTTP {error.code}: {message}") from None


def publish(archive_path):
    token = os.environ["CWS_ACCESS_TOKEN"]
    publisher = quote(os.environ["CWS_PUBLISHER_ID"], safe="")
    extension = os.environ["CWS_EXTENSION_ID"]
    if not token or not publisher or not re.fullmatch(r"[a-p]{32}", extension):
        raise ValueError("Confira o token, o Publisher ID e o ID do item na Chrome Web Store.")

    with ZipFile(archive_path) as archive:
        version = json.loads(archive.read("manifest.json"))["version"]
    candidate = version_parts(version)
    item = f"publishers/{publisher}/items/{extension}"
    status_url = f"{API}/v2/{item}:fetchStatus"
    status = request(status_url, token)
    for revision in ("publishedItemRevisionStatus", "submittedItemRevisionStatus"):
        for channel in status.get(revision, {}).get("distributionChannels", []):
            current = channel["crxVersion"]
            if candidate <= version_parts(current):
                print(f"Versão {version} já alcançada pela versão {current} na loja.")
                return
    if status.get("lastAsyncUploadState") in UPLOAD_RUNNING:
        raise RuntimeError("A loja já está processando outro upload. Execute o fluxo novamente depois.")

    upload = request(
        f"{API}/upload/v2/{item}:upload?uploadType=media",
        token, archive_path.read_bytes(), "application/zip",
    )
    if upload.get("crxVersion", version) != version:
        raise RuntimeError("A versão recebida pela loja difere da versão do pacote.")

    state = upload.get("uploadState")
    if state in UPLOAD_RUNNING:
        for _ in range(30):
            sleep(5)
            state = request(status_url, token).get("lastAsyncUploadState")
            if state and state != "NOT_FOUND" and state not in UPLOAD_RUNNING:
                break
    if state != "SUCCEEDED":
        raise RuntimeError(f"O upload da versão {version} não foi concluído. Estado: {state}.")

    submission = request(
        f"{API}/v2/{item}:publish",
        token, b'{"publishType":"DEFAULT_PUBLISH"}', "application/json",
    )
    print(f"Versão {version} enviada à Chrome Web Store. Estado: {submission['state']}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("package", "publish"))
    parser.add_argument("zip", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "package":
            package(args.zip)
        else:
            publish(args.zip)
    except (ValueError, KeyError, OSError, BadZipFile, URLError, RuntimeError) as error:
        parser.exit(1, f"Erro: {error}\n")


if __name__ == "__main__":
    main()
