#!/usr/bin/env python3
"""Press buttons on the Samsung TV over the network, the same way its remote does.

    python3 tools/tv-keys.py 192.168.1.50 1 2 3 4 5

Uses the TV's own remote-control connection (port 8002), so nothing is installed on
the TV. The first time, the TV asks whether to allow "TV Home" to control it: choose
Allow with the remote. Keys are digits (1, 2 …) or Samsung key names (ENTER, RETURN,
HOME, UP, DOWN …). Only Python's standard library is used.
"""
import base64
import json
import os
import socket
import ssl
import struct
import sys
import time

PORT = 8002
NAME = 'TV Home'


def frame(opcode, payload=b''):
    """A masked client frame, as the WebSocket protocol requires."""
    mask = os.urandom(4)
    n = len(payload)
    if n < 126:
        head = struct.pack('!BB', 0x80 | opcode, 0x80 | n)
    elif n < 65536:
        head = struct.pack('!BBH', 0x80 | opcode, 0x80 | 126, n)
    else:
        head = struct.pack('!BBQ', 0x80 | opcode, 0x80 | 127, n)
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def recv_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError('the TV closed the connection')
        buf += chunk
    return buf


def recv_text(sock):
    """The next text message from the TV, answering pings on the way."""
    while True:
        b1, b2 = recv_exact(sock, 2)
        opcode, n = b1 & 0x0F, b2 & 0x7F
        if n == 126:
            n = struct.unpack('!H', recv_exact(sock, 2))[0]
        elif n == 127:
            n = struct.unpack('!Q', recv_exact(sock, 8))[0]
        mask = recv_exact(sock, 4) if b2 & 0x80 else None
        data = recv_exact(sock, n)
        if mask:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        if opcode == 0x9:
            sock.sendall(frame(0xA, data))
        elif opcode == 0x8:
            raise ConnectionError('the TV closed the connection')
        elif opcode == 0x1:
            return data.decode('utf-8', 'replace')


def connect(ip):
    raw = socket.create_connection((ip, PORT), timeout=10)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # the TV only has a self-signed certificate
    sock = ctx.wrap_socket(raw, server_hostname=ip)
    key = base64.b64encode(os.urandom(16)).decode()
    path = '/api/v2/channels/samsung.remote.control?name=' + base64.b64encode(NAME.encode()).decode()
    sock.sendall((
        f'GET {path} HTTP/1.1\r\nHost: {ip}:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
        f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
    head = b''
    while b'\r\n\r\n' not in head:
        head += recv_exact(sock, 1)
    status = head.split(b'\r\n', 1)[0].decode('latin-1')
    if ' 101 ' not in status + ' ':
        raise ConnectionError('the TV refused the connection (' + status + ')')
    return sock


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    ip, keys = sys.argv[1], sys.argv[2:]
    print('Connecting to the TV. If it asks whether to allow "TV Home", choose Allow.')
    try:
        sock = connect(ip)
        sock.settimeout(60)  # time to answer the Allow prompt
        while True:
            event = json.loads(recv_text(sock)).get('event')
            if event == 'ms.channel.connect':
                break
            if event == 'ms.channel.unauthorized':
                sys.exit('The TV said no. Run this again and choose Allow on the TV.')
    except (OSError, ConnectionError) as e:
        sys.exit(f"Couldn't reach the TV at {ip}: {e}. Check the IP and that the TV is on.")
    for k in keys:
        code = k.upper() if k.upper().startswith('KEY_') else 'KEY_' + k.upper()
        sock.sendall(frame(0x1, json.dumps({'method': 'ms.remote.control', 'params': {
            'Cmd': 'Click', 'DataOfCmd': code, 'Option': 'false', 'TypeOfRemote': 'SendRemoteKey'}}).encode()))
        print('pressed', code)
        time.sleep(0.7)
    try:
        sock.sendall(frame(0x8, struct.pack('!H', 1000)))
        sock.close()
    except OSError:
        pass


if __name__ == '__main__':
    main()
