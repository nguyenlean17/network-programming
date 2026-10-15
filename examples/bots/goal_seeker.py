"""OTTv2 Bot API 1.0: prefer immediate goals, then captures and progress."""
import json
import sys


def main():
    request = json.load(sys.stdin)
    board = request["board"]
    moves = request["legalMoves"]
    player = request["player"]
    if not moves:
        raise ValueError("No legal move")
    goal = request["goals"][player]
    gx, gy = ord(goal[0]) - 65, int(goal[1]) - 1

    def score(move):
        x, y = ord(move["to"][0]) - 65, int(move["to"][1]) - 1
        capture = board[y][x] is not None
        return (1000 if move["to"] == goal else 0) + (20 if capture else 0) - max(abs(x - gx), abs(y - gy))

    json.dump({"apiVersion": "1.0", "move": max(moves, key=score), "memory": None}, sys.stdout)


if __name__ == "__main__":
    main()
