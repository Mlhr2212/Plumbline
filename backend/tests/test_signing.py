import time

from app.security import signing


def test_roundtrip():
    body = b'{"a":1}'
    ts = int(time.time())
    sig = signing.sign("s3cret", ts, body)
    assert signing.verify("s3cret", str(ts), sig, body)


def test_wrong_secret():
    body = b"x"
    ts = int(time.time())
    sig = signing.sign("a", ts, body)
    assert not signing.verify("b", str(ts), sig, body)


def test_tampered_body():
    ts = int(time.time())
    sig = signing.sign("s", ts, b"one")
    assert not signing.verify("s", str(ts), sig, b"two")


def test_stale_timestamp():
    ts = int(time.time()) - 3600
    sig = signing.sign("s", ts, b"x")
    assert not signing.verify("s", str(ts), sig, b"x")


def test_missing_values():
    assert not signing.verify("", "", "", b"")
