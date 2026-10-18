"""OTTv2 Bot API 1.0 — edit choose_move to implement your strategy."""
import json
import sys


def choose_move(state):
    """Return (move, memory). Each move must come from state['legalMoves']."""
    moves = state["legalMoves"]
    # Start here: evaluate state['board'], state['player'] and state['goals'].
    # This starter simply chooses the first legal move; it is not a strong bot.
    return moves[0], None


def main():
    state = json.load(sys.stdin)
    move, memory = choose_move(state)
    # stdout is reserved for this JSON. Send debug messages to sys.stderr.
    json.dump({"apiVersion": "1.0", "move": move, "memory": memory}, sys.stdout)


if __name__ == "__main__":
    main()
