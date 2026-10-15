"""OTTv2 Bot API 1.0: choose the first legal move.

The runner sends one JSON request on stdin and expects one JSON response on stdout.
"""
import json
import sys


def main():
    request = json.load(sys.stdin)
    moves = request["legalMoves"]
    if not moves:
        raise ValueError("No legal move")
    json.dump({"apiVersion": "1.0", "move": moves[0], "memory": None}, sys.stdout)


if __name__ == "__main__":
    main()
