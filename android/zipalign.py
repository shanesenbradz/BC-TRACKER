#!/usr/bin/env python3
"""Rewrites an APK so every stored (uncompressed) entry starts on a 4-byte
boundary, the same thing Android's zipalign does. Android 11+ will not
install an APK whose resources.arsc is compressed or unaligned."""
import sys, zipfile

def align(src, dst, n=4):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            store = info.filename == "resources.arsc" or info.compress_type == zipfile.ZIP_STORED
            zi = zipfile.ZipInfo(info.filename, date_time=(2008, 1, 1, 0, 0, 0))
            zi.external_attr = info.external_attr
            zi.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
            zi.extra = b""
            if store:
                offset = zout.fp.tell() + 30 + len(zi.filename.encode("utf-8"))
                zi.extra = b"\0" * ((n - offset % n) % n)
            zout.writestr(zi, data)

if __name__ == "__main__":
    align(sys.argv[1], sys.argv[2])
