#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    # Monkey-patch ssl.wrap_socket which was removed in Python 3.12+
    import ssl
    if not hasattr(ssl, 'wrap_socket'):
        def wrap_socket(sock, keyfile=None, certfile=None, server_side=False, cert_reqs=ssl.CERT_NONE, ca_certs=None, do_handshake_on_connect=True, suppress_ragged_eofs=True, ciphers=None, ssl_version=None):
            try:
                protocol = ssl.PROTOCOL_TLS_SERVER if server_side else ssl.PROTOCOL_TLS_CLIENT
                context = ssl.SSLContext(protocol)
            except AttributeError:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS)
            
            context.check_hostname = False
            context.verify_mode = cert_reqs
            
            if ca_certs:
                context.load_verify_locations(ca_certs)
            if certfile:
                context.load_cert_chain(certfile, keyfile)
            if ciphers:
                context.set_ciphers(ciphers)
                
            return context.wrap_socket(
                sock,
                server_side=server_side,
                do_handshake_on_connect=do_handshake_on_connect,
                suppress_ragged_eofs=suppress_ragged_eofs
            )
        ssl.wrap_socket = wrap_socket

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smart_aquaculture.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
