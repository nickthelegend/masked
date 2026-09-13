export const FOGDUEL_IDL = {
  "address": "3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1",
  "metadata": {
    "name": "fogduel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Fog Duel — hidden-position 1v1 trading on MagicBlock Private Ephemeral Rollups"
  },
  "docs": [
    "`#[ephemeral]` wires in the magic-program plumbing every delegated program",
    "needs. It must sit above `#[program]`."
  ],
  "instructions": [
    {
      "name": "apply_fill",
      "docs": [
        "Buy or sell base against the virtual quote balance. Runs on the ER",
        "against private state.",
        "",
        "`owner` names whose position is being filled, and is separate from who",
        "signed. Normally they are the same key. With a Gum session token they",
        "are not: a session key signs on the owner's behalf for the life of the",
        "token, so a sixty-second round does not need a wallet popup per fill.",
        "",
        "`session_auth_or` runs the fallback below when no token is presented —",
        "the signer must be the owner — and defers to the session program when",
        "one is. There is no path where an unrelated key moves somebody's book."
      ],
      "discriminator": [
        201,
        39,
        90,
        111,
        97,
        71,
        105,
        6
      ],
      "accounts": [
        {
          "name": "player",
          "docs": [
            "Whoever signed: the owner, or a session key acting for them."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "The position being filled — and, inside it, that player's own private",
            "book. Delegated to the rollup, so a fill moves that book there and never",
            "on a public venue.",
            "",
            "Seeded by `owner` rather than by the signer, because with a session key",
            "those differ. Ownership is still checked: `session_auth_or` requires the",
            "signer to be the owner when no token is presented, and `apply_fill`",
            "additionally asserts `position.owner == owner`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "session_token",
          "docs": [
            "A Gum session token authorising `player` to act for `position.owner`.",
            "Optional: without one, the signer must be the owner."
          ],
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "Side"
            }
          }
        },
        {
          "name": "qty",
          "type": "u64"
        },
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "cancel_if_unjoined",
      "docs": [
        "Creator reclaims their entry while the match is still unjoined."
      ],
      "discriminator": [
        237,
        202,
        31,
        197,
        86,
        43,
        211,
        121
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "commit_and_undelegate_position",
      "docs": [
        "Commit one position back to L1 and release its delegation.",
        "",
        "Called on the ER once the clock expires, once per side. After both have",
        "landed the positions are readable on L1 again and `settle_match` can run.",
        "",
        "One at a time, deliberately. A Position is 559 bytes, so two of them do",
        "not fit in a single 1232-byte transaction, and asking the rollup to",
        "commit both at once pushes its committor onto a chunked buffer path.",
        "Committing them separately keeps every commit inline, and a failure on",
        "one side no longer strands the other."
      ],
      "discriminator": [
        58,
        231,
        195,
        159,
        242,
        112,
        255,
        117
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "magic_program",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magic_context",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commit_and_undelegate_status",
      "docs": [
        "Bring the public round status back from the rollup.",
        "",
        "`settle_match` runs on L1 and reads the liquidation flags off this",
        "account to write them onto the tape. A delegated account is owned by the",
        "delegation program on L1, so without this the settle transaction would",
        "be rejected before it read anything."
      ],
      "discriminator": [
        78,
        127,
        172,
        129,
        19,
        192,
        0,
        99
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "round_status",
          "writable": true
        },
        {
          "name": "magic_program",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magic_context",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "crank_commit_round",
      "docs": [
        "The buzzer, run by the rollup: commit and release both positions and the",
        "round status.",
        "",
        "Does nothing before the buzzer (the task's first run lands mid-round)",
        "and skips anything already on its way home, so a player's client that",
        "got there first costs nothing and fails nothing. Each account is its own",
        "intent: a position is 559 bytes, and committing two at once sends the",
        "committor down a chunked path that one at a time never needs."
      ],
      "discriminator": [
        37,
        195,
        197,
        118,
        33,
        208,
        154,
        175
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "As in `CrankLiquidate`. Also the payer of the commits it schedules."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position_a",
          "writable": true
        },
        {
          "name": "position_b",
          "writable": true
        },
        {
          "name": "round_status",
          "writable": true
        },
        {
          "name": "magic_context",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        },
        {
          "name": "magic_program",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "crank_liquidate",
      "docs": [
        "The keeper's beat, run by the rollup: liquidate whichever side has run",
        "out of equity.",
        "",
        "Both sides in one instruction, and quiet about everything that is not a",
        "blow-up — the round not live, the clock run out — because a task that",
        "errors is retried and then dropped, and a keeper that stops at the first",
        "awkward moment is not a keeper."
      ],
      "discriminator": [
        130,
        105,
        187,
        143,
        21,
        74,
        70,
        126
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "On the rollup, the crank signer of whoever scheduled the keeper. Never",
            "writable: the rollup refuses a task that asks for that."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed_a",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed_b",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "Position"
              }
            ]
          }
        },
        {
          "name": "position_a",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position_b",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "Position"
              }
            ]
          }
        },
        {
          "name": "round_status",
          "docs": [
            "Unsealed on purpose. See `RoundStatus`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "create_match",
      "docs": [
        "Open a match and escrow the creator's entry."
      ],
      "discriminator": [
        107,
        2,
        184,
        145,
        70,
        142,
        17,
        165
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "match_id"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "docs": [
            "The creator's feed. One per player now, so it is seeded by owner."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "round_status",
          "docs": [
            "Deliberately unsealed: this is the one thing about a live round that is",
            "public. See `RoundStatus`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "match_id",
          "type": "u64"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "entry",
          "type": "u64"
        },
        {
          "name": "start_px",
          "type": "u64"
        },
        {
          "name": "market_type",
          "type": {
            "defined": {
              "name": "MarketType"
            }
          }
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "create_position_permission",
      "docs": [
        "Create the L1 access-control list for a position, on the base layer.",
        "",
        "The ephemeral (TEE) permission path has to run on the ER and needs a",
        "delegated payer; this one runs on L1 where the wallet can pay normally.",
        "The member set is the same either way: the owner, and nobody else.",
        "",
        "The position PDA has to sign for its own permission, which is why this",
        "is a program CPI rather than a client instruction."
      ],
      "discriminator": [
        63,
        240,
        0,
        131,
        105,
        193,
        0,
        50
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permission_program",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "owner_program",
          "address": "3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1"
        },
        {
          "name": "delegation_program",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "delegate_position_permission",
      "docs": [
        "Delegate a position's permission to the same validator the position",
        "itself is delegated to, so the rollup can enforce the ACL."
      ],
      "discriminator": [
        122,
        231,
        253,
        49,
        64,
        161,
        43,
        39
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "delegation_buffer",
          "writable": true
        },
        {
          "name": "delegation_record",
          "writable": true
        },
        {
          "name": "delegation_metadata",
          "writable": true
        },
        {
          "name": "validator"
        },
        {
          "name": "permission_program",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "delegation_program",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "delegate_position_to_er",
      "docs": [
        "Delegate one player's `Position` to an Ephemeral Rollup validator.",
        "",
        "After this lands the account is owned by the delegation program on L1",
        "and is only writable on the ER. Pass the TEE validator identity to get",
        "a *private* rollup — a plain ER validator gives speed but no privacy."
      ],
      "discriminator": [
        130,
        247,
        100,
        30,
        195,
        126,
        115,
        224
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "buffer_position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                34,
                87,
                31,
                141,
                149,
                180,
                182,
                229,
                165,
                163,
                202,
                172,
                78,
                88,
                59,
                31,
                185,
                225,
                213,
                201,
                69,
                196,
                187,
                239,
                225,
                147,
                121,
                167,
                126,
                29,
                3,
                4
              ]
            }
          }
        },
        {
          "name": "delegation_record_position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegation_program"
            }
          }
        },
        {
          "name": "delegation_metadata_position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegation_program"
            }
          }
        },
        {
          "name": "position",
          "docs": [
            "program, so this cannot stay a typed `Account`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner_program",
          "address": "3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1"
        },
        {
          "name": "delegation_program",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        },
        {
          "name": "validator",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "commit_frequency_ms",
          "type": "u32"
        }
      ]
    },
    {
      "name": "delegate_status_to_er",
      "docs": [
        "Delegate the public round status to the rollup.",
        "",
        "`liquidate` runs on the rollup, because that is where positions live,",
        "so the account it announces into has to be writable there too. Unlike a",
        "position this one is never given a permission, so it stays readable by",
        "everyone — which is the entire reason it exists."
      ],
      "discriminator": [
        151,
        143,
        77,
        19,
        105,
        14,
        28,
        228
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "buffer_round_status",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "round_status"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                34,
                87,
                31,
                141,
                149,
                180,
                182,
                229,
                165,
                163,
                202,
                172,
                78,
                88,
                59,
                31,
                185,
                225,
                213,
                201,
                69,
                196,
                187,
                239,
                225,
                147,
                121,
                167,
                126,
                29,
                3,
                4
              ]
            }
          }
        },
        {
          "name": "delegation_record_round_status",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "round_status"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegation_program"
            }
          }
        },
        {
          "name": "delegation_metadata_round_status",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "round_status"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegation_program"
            }
          }
        },
        {
          "name": "round_status",
          "docs": [
            "program, so this cannot stay a typed `Account`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "owner_program",
          "address": "3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1"
        },
        {
          "name": "delegation_program",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "validator",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "commit_frequency_ms",
          "type": "u32"
        }
      ]
    },
    {
      "name": "init_position_privacy",
      "docs": [
        "Mark a delegated `Position` private on the ER.",
        "",
        "This is the instruction the whole product rests on. It creates an",
        "ephemeral permission with `is_private: true` and exactly one member —",
        "the position's owner. From this point the TEE blocks any read of this",
        "account at ingress for every other key, including the opponent's and",
        "including an unauthenticated public RPC.",
        "",
        "The flags matter as much as the membership: withholding the account but",
        "leaking transaction logs or balances would expose the same fills by a",
        "side channel, so logs, messages and balances are all gated to the owner.",
        "",
        "Idempotent — the permission program skips creation if one already",
        "exists, so callers may retry freely.",
        "",
        "Runs on the ER, not L1."
      ],
      "discriminator": [
        20,
        189,
        157,
        34,
        252,
        151,
        182,
        129
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Transaction fee payer only. Deliberately NOT `mut`: on the ER a",
            "writable non-delegated account fails transaction verification."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "ephemeral_vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magic_program",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "permission_program",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "init_treasury",
      "discriminator": [
        105,
        152,
        173,
        51,
        158,
        151,
        49,
        14
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "join_match",
      "docs": [
        "Join an open match. Escrows the joiner's entry, starts the clock, and",
        "seeds both positions with their virtual quote balance."
      ],
      "discriminator": [
        244,
        8,
        47,
        130,
        192,
        59,
        179,
        44
      ],
      "accounts": [
        {
          "name": "joiner",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "docs": [
            "The creator's feed, opened at create time."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed_b",
          "docs": [
            "The joiner's own feed, for the token they are bringing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "joiner"
              }
            ]
          }
        },
        {
          "name": "position_a",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position_b",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "joiner"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "start_px",
          "type": "u64"
        },
        {
          "name": "market_type",
          "type": {
            "defined": {
              "name": "MarketType"
            }
          }
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Force-close a position that has run out of equity, and say so publicly.",
        "",
        "Runs on the rollup, because that is where the position lives. The mark",
        "is written on L1 but the rollup carries a readable clone of the feed, so",
        "both halves of the question — what is this worth, and what does the",
        "player hold — are answerable here and nowhere else.",
        "",
        "Permissionless, like settlement: a player would never call it on",
        "themselves, and an opponent has every reason to. Calling it on a",
        "position that is solvent does nothing, so there is no grief in trying.",
        "",
        "The result is announced in `RoundStatus`, which carries no ACL. That is",
        "a deliberate hole in the fog and the only one: position *contents* stay",
        "sealed, but the fact that a side blew up is public the moment it does."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Anyone. They pay the fee and get nothing for it but the outcome."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "round_status",
          "docs": [
            "Unsealed on purpose. See `RoundStatus`."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "process_undelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "base_account",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "base_account"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "account_seeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "push_price",
      "docs": [
        "Post a new mark for one player's market.",
        "",
        "One feed per player, because the two sides no longer trade the same",
        "token. The symmetry that used to matter — neither side quoted a",
        "different price than the other — is replaced by a narrower guarantee",
        "that still bites: a player's fills are priced by the feed for the token",
        "they chose, and that feed is rate-limited like any other.",
        "",
        "Permissionless. The obvious alternative, letting only the creator post,",
        "is worse: it hands one player the power to time the mark against the",
        "other. With anyone able to post, the defence is the rate limit rather",
        "than the identity — at most MAX_PUSH_BPS per MIN_PUSH_INTERVAL, so a",
        "player who wants the mark somewhere else has to walk it there in",
        "public, a step at a time, while their opponent watches and trades.",
        "",
        "This is a stand-in for an oracle, and it is the one place where the",
        "round trusts something off-chain. For a major Pyth publishes, the",
        "replacement is `push_price_pyth`; a feed that has taken a Pyth price is",
        "refused here for the rest of the round."
      ],
      "discriminator": [
        113,
        238,
        232,
        235,
        60,
        71,
        127,
        203
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Anyone. Deliberately not checked against `price_feed.authority`: see",
            "`push_price`. Signing is only so somebody pays the fee."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "px",
          "type": "u64"
        },
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "push_price_pyth",
      "docs": [
        "Post a major's mark from Pyth, and hand that feed to Pyth for the rest",
        "of the round.",
        "",
        "The price is token/USD over SOL/USD, both read from `PriceUpdateV2`",
        "accounts Pyth's receiver owns — fully verified, fresh, inside the",
        "confidence band (see `pyth.rs`). It is signed by Pyth's publishers, so",
        "unlike `push_price` it takes no step limit. Which feed prices which",
        "mint is fixed in `pyth::MAJOR_FEEDS`, so a caller cannot hand in another",
        "token's update.",
        "",
        "Permissionless like `push_price`, for the same reason. Once a feed has",
        "taken a Pyth price its `authority` is the receiver and `push_price`",
        "refuses it. Each later Pyth push must not be older than the pair before",
        "it, and at least one of its two updates must be newer, so a stale signed",
        "update cannot be replayed to drag the mark back."
      ],
      "discriminator": [
        153,
        209,
        116,
        55,
        0,
        10,
        1,
        52
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Anyone, as for `push_price`. Signing is only so somebody pays the fee."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "token_price_update",
          "docs": [
            "verification level, feed id, freshness and confidence are checked in",
            "`pyth::read_checked`."
          ]
        },
        {
          "name": "sol_price_update"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "request_market_draw",
      "docs": [
        "One-time protocol treasury init.",
        "Ask MagicBlock's VRF which of three markets this duel will be fought on.",
        "",
        "A trading duel where one side picks the market is a duel about",
        "preparation: the opener chooses the coin they have been watching all",
        "week and the other player is behind before a fill is placed. Here the",
        "opener nominates three and verifiable randomness picks one.",
        "",
        "This only *requests*. The answer arrives later, in a transaction the",
        "VRF program signs, and `settle_market_draw` refuses it from anyone",
        "else — which is the whole difference between this and shuffling an",
        "array in the client."
      ],
      "discriminator": [
        231,
        159,
        59,
        206,
        73,
        137,
        122,
        107
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "draw",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  114,
                  97,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "draw_id"
              }
            ]
          }
        },
        {
          "name": "oracle_queue",
          "docs": [
            "The VRF queue the request is posted to. Caller-chosen, so the macro",
            "leaves it to us; everything else in this struct it adds itself."
          ],
          "writable": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "program_identity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrf_program",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slot_hashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "draw_id",
          "type": "u64"
        },
        {
          "name": "candidates",
          "type": {
            "array": [
              {
                "defined": {
                  "name": "MarketRef"
                }
              },
              3
            ]
          }
        },
        {
          "name": "caller_seed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "request_settle",
      "docs": [
        "Flip the match into settling once the clock has run out. Permissionless",
        "so a stalling loser cannot hold the pot hostage."
      ],
      "discriminator": [
        90,
        16,
        38,
        40,
        222,
        168,
        193,
        70
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless — anyone may trigger settlement once the clock expires."
          ],
          "signer": true
        },
        {
          "name": "match_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "schedule_round_cranks",
      "docs": [
        "Hand the round's upkeep to the rollup itself.",
        "",
        "Schedules two tasks on the Ephemeral Rollup, run by the rollup's own",
        "crank rather than by anybody's browser:",
        "",
        "- a keeper that looks for a blown-up position every two seconds until",
        "just before the buzzer, and liquidates it in public;",
        "- the buzzer: just past the end of the round, commit both positions and",
        "the round status back to Solana, and release them.",
        "",
        "The access-control lists are not the crank's to release. The permission",
        "program pays for that commit from whoever signs as the list's authority,",
        "and a signer the rollup holds delegated — a position PDA — can only pay",
        "alongside a fee vault the permission program does not pass. So each",
        "player's client releases its own list after the buzzer, signed by the",
        "wallet the list names.",
        "",
        "Both used to be the players' clients' job. A round whose players had",
        "closed their tabs was never checked for a blow-up and never came home;",
        "it sat on the rollup until somebody ran a script.",
        "",
        "A task runs once the moment it is scheduled, so the buzzer task gets two",
        "runs: the first lands mid-round and does nothing, the second lands just",
        "past the buzzer. Scheduling again replaces a task this signer owns and",
        "leaves one another signer owns alone, so both players' clients can call",
        "this and exactly one keeper runs.",
        "",
        "Runs on the rollup."
      ],
      "discriminator": [
        254,
        140,
        230,
        200,
        233,
        65,
        30,
        64
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Signs the schedule. Both tasks run under this key's crank signer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "magic_program",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "settle_market_draw",
      "docs": [
        "The oracle's answer: which market the duel is on.",
        "",
        "`#[vrf_callback]` puts the VRF program's identity in the accounts and",
        "requires it to have signed, so this cannot be called by a player."
      ],
      "discriminator": [
        108,
        93,
        230,
        64,
        164,
        93,
        64,
        170
      ],
      "accounts": [
        {
          "name": "vrf_program_identity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "draw",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "settle_match",
      "docs": [
        "Close out both positions at the final mark, compare PnL, pay the",
        "winner, and write the public tape."
      ],
      "discriminator": [
        71,
        124,
        117,
        96,
        191,
        217,
        116,
        24
      ],
      "accounts": [
        {
          "name": "cranker",
          "writable": true,
          "signer": true
        },
        {
          "name": "match_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "price_feed",
          "docs": [
            "The creator's market, for valuing the creator's position."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "price_feed_b",
          "docs": [
            "The joiner's market. A different token, so a different mark."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "Position"
              }
            ]
          }
        },
        {
          "name": "round_status",
          "docs": [
            "Read here only to copy the liquidation flags onto the tape, so the",
            "permanent record says whether a side was closed out or traded to the",
            "buzzer."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  117,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "position_a",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "position_b",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "Position"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "joiner",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tape",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  112,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "match_account"
              }
            ]
          }
        },
        {
          "name": "stats_creator",
          "docs": [
            "`init_if_needed` because a player's first settlement creates their",
            "record and every later one updates it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "Match"
              }
            ]
          }
        },
        {
          "name": "stats_joiner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "Position"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "MarketDraw",
      "discriminator": [
        78,
        206,
        61,
        45,
        93,
        224,
        197,
        79
      ]
    },
    {
      "name": "Match",
      "discriminator": [
        236,
        63,
        169,
        38,
        15,
        56,
        196,
        162
      ]
    },
    {
      "name": "PlayerStats",
      "discriminator": [
        169,
        146,
        242,
        176,
        102,
        118,
        231,
        172
      ]
    },
    {
      "name": "Position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "PriceFeed",
      "discriminator": [
        189,
        103,
        252,
        23,
        152,
        35,
        243,
        156
      ]
    },
    {
      "name": "RoundStatus",
      "discriminator": [
        80,
        158,
        199,
        249,
        29,
        255,
        40,
        218
      ]
    },
    {
      "name": "SessionToken",
      "discriminator": [
        233,
        4,
        115,
        14,
        46,
        21,
        1,
        15
      ]
    },
    {
      "name": "Tape",
      "discriminator": [
        60,
        19,
        137,
        0,
        97,
        74,
        23,
        131
      ]
    },
    {
      "name": "Treasury",
      "discriminator": [
        238,
        239,
        123,
        238,
        89,
        1,
        168,
        253
      ]
    },
    {
      "name": "Vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "MatchNotOpen",
      "msg": "Match is not open for joining"
    },
    {
      "code": 6001,
      "name": "MatchNotLive",
      "msg": "Match is not live"
    },
    {
      "code": 6002,
      "name": "MatchNotSettling",
      "msg": "Match is not settling"
    },
    {
      "code": 6003,
      "name": "SelfJoin",
      "msg": "Cannot join your own match"
    },
    {
      "code": 6004,
      "name": "MatchStale",
      "msg": "This match was opened too long ago — its price is stale. Ask the creator to reopen it."
    },
    {
      "code": 6005,
      "name": "MatchStillRunning",
      "msg": "Match has not reached its end time"
    },
    {
      "code": 6006,
      "name": "MatchExpired",
      "msg": "Match clock has already expired"
    },
    {
      "code": 6007,
      "name": "NotAParticipant",
      "msg": "Not a participant in this match"
    },
    {
      "code": 6008,
      "name": "InsufficientQuote",
      "msg": "Insufficient quote balance for this fill"
    },
    {
      "code": 6009,
      "name": "InsufficientBase",
      "msg": "Insufficient base quantity for this fill"
    },
    {
      "code": 6010,
      "name": "ZeroQuantity",
      "msg": "Fill quantity must be greater than zero"
    },
    {
      "code": 6011,
      "name": "InvalidPrice",
      "msg": "Price feed is not initialized or is stale"
    },
    {
      "code": 6012,
      "name": "InvalidDuration",
      "msg": "Duration out of allowed range"
    },
    {
      "code": 6013,
      "name": "InvalidEntry",
      "msg": "Entry amount must be greater than zero"
    },
    {
      "code": 6014,
      "name": "MathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6015,
      "name": "VaultUnderfunded",
      "msg": "Vault has insufficient lamports"
    },
    {
      "code": 6016,
      "name": "PriceTooSoon",
      "msg": "Price posted too soon after the last one"
    },
    {
      "code": 6017,
      "name": "PriceJump",
      "msg": "Price moved further in one push than the rate limit allows"
    },
    {
      "code": 6018,
      "name": "DrawAlreadySettled",
      "msg": "This market draw has already been settled"
    },
    {
      "code": 6019,
      "name": "DrawNotSettled",
      "msg": "This market draw has not been settled yet"
    },
    {
      "code": 6020,
      "name": "DrawAlreadyUsed",
      "msg": "This market draw has already opened a match"
    },
    {
      "code": 6021,
      "name": "NotTheDrawOpener",
      "msg": "Not the wallet that opened this draw"
    },
    {
      "code": 6022,
      "name": "NotAMajor",
      "msg": "Only a major market takes an oracle price"
    },
    {
      "code": 6023,
      "name": "NoOracleForMint",
      "msg": "The program has no Pyth feed for this mint"
    },
    {
      "code": 6024,
      "name": "OracleAccountInvalid",
      "msg": "Not a Pyth price update owned by the receiver program"
    },
    {
      "code": 6025,
      "name": "OracleNotFullyVerified",
      "msg": "Pyth price update is not fully verified"
    },
    {
      "code": 6026,
      "name": "OracleWrongFeed",
      "msg": "Pyth price update is for a different feed"
    },
    {
      "code": 6027,
      "name": "OracleStale",
      "msg": "Pyth price update is too old, or dated in the future"
    },
    {
      "code": 6028,
      "name": "OracleConfidence",
      "msg": "Pyth confidence interval is too wide"
    },
    {
      "code": 6029,
      "name": "OracleUpdateNotNewer",
      "msg": "Pyth price update is not newer than the mark it would replace"
    },
    {
      "code": 6030,
      "name": "OracleOwnsFeed",
      "msg": "This feed takes its price from Pyth for the rest of the round"
    }
  ],
  "types": [
    {
      "name": "Book",
      "docs": [
        "A constant-product book, private to one player.",
        "",
        "Seeded at join from a snapshot of the real market mid, re-pegged to the",
        "posted price before every fill, and never touched by anything public.",
        "",
        "One book per player, and it lives *inside* the Position — which is the",
        "account the permission program seals. A single book shared by both sides",
        "would leak: your fill moves the mid, and an opponent watching the mid reads",
        "your flow straight off it. Hiding the Position while publishing a mark that",
        "every fill moves is not privacy, it is a slower way to tell them.",
        "",
        "Because each side trades its own curve, impact is purely the cost of your",
        "own size. Neither player can push the other's execution around, and the",
        "price signal both are trading comes from the posted mark."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "virtual_base",
            "docs": [
              "Virtual base reserves, in whole tokens x BASE_SCALE."
            ],
            "type": "u64"
          },
          {
            "name": "virtual_quote",
            "docs": [
              "Virtual quote reserves, in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "seed_px",
            "docs": [
              "Mid the round opened on. Kept for the tape; never re-pegged away."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Fill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "Side"
              }
            }
          },
          {
            "name": "qty",
            "docs": [
              "Base quantity, scaled by BASE_SCALE."
            ],
            "type": "u64"
          },
          {
            "name": "px",
            "docs": [
              "Execution price: lamports per token, scaled by PRICE_SCALE."
            ],
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Leg",
      "docs": [
        "One player's chosen market.",
        "",
        "A duel used to be two players on one token. It is now two players on two",
        "tokens, compared on PnL — so everything that described \"the market\" has to",
        "be said twice, once per side."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "The token this player is trading. Informational for settlement —",
              "positions are virtual inventory, so no SPL transfer happens mid-round."
            ],
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "docs": [
              "Ticker, zero-padded. Display only; the mint is the identity."
            ],
            "type": {
              "array": [
                "u8",
                12
              ]
            }
          },
          {
            "name": "name",
            "docs": [
              "Token name, zero-padded."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "market_type",
            "docs": [
              "Which feed prices it, which decides how the mark is produced."
            ],
            "type": {
              "defined": {
                "name": "MarketType"
              }
            }
          },
          {
            "name": "start_px",
            "docs": [
              "The mark this player's round opened on, and their book was seeded at."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MarketDraw",
      "docs": [
        "A market chosen by MagicBlock's VRF rather than by a player.",
        "",
        "A trading duel where one side picks the market is a duel about preparation,",
        "not trading — the opener can choose the coin they have been watching all",
        "week. Here the opener nominates three and verifiable randomness picks one,",
        "so neither player knows the market until it is drawn and neither could have",
        "arranged it.",
        "",
        "`chosen` stays -1 until the oracle calls back, which is what makes this a",
        "real draw rather than a client-side shuffle: the value arrives in a",
        "transaction signed by the VRF program's identity, and the program will not",
        "accept it from anybody else."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "opener",
            "docs": [
              "Who opened the draw. Only they may create the match from its result."
            ],
            "type": "pubkey"
          },
          {
            "name": "draw_id",
            "docs": [
              "Ties the draw to one intended match, so a result cannot be reused."
            ],
            "type": "u64"
          },
          {
            "name": "candidates",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "MarketRef"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "chosen",
            "docs": [
              "Index into `candidates`, or -1 while the oracle has not answered."
            ],
            "type": "i8"
          },
          {
            "name": "randomness",
            "docs": [
              "The randomness the oracle returned, kept so the result is checkable."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "requested_ts",
            "type": "i64"
          },
          {
            "name": "fulfilled_ts",
            "type": "i64"
          },
          {
            "name": "consumed",
            "docs": [
              "Set once the match is created, so one draw cannot open two matches."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MarketRef",
      "docs": [
        "One market a draw can land on."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                12
              ]
            }
          },
          {
            "name": "market_type",
            "type": {
              "defined": {
                "name": "MarketType"
              }
            }
          },
          {
            "name": "start_px",
            "docs": [
              "Lamports per token x PRICE_SCALE, snapshotted when the draw was opened."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "MarketType",
      "docs": [
        "Which kind of market a duel is fought over.",
        "",
        "Meme markets are priced by an internal constant-product AMM seeded from a",
        "snapshot of the token's real bonding-curve mid. Major markets are priced",
        "from a posted oracle mark. Neither routes the battle fill through a public",
        "venue — a public swap print would leak wallet, mint and size, which is",
        "exactly what the fog exists to prevent."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Meme"
          },
          {
            "name": "Major"
          }
        ]
      }
    },
    {
      "name": "Match",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "joiner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "leg_a",
            "docs": [
              "The creator's market. Set at `create_match`."
            ],
            "type": {
              "defined": {
                "name": "Leg"
              }
            }
          },
          {
            "name": "leg_b",
            "docs": [
              "The joiner's market. Zeroed until somebody joins and names their own."
            ],
            "type": {
              "defined": {
                "name": "Leg"
              }
            }
          },
          {
            "name": "match_id",
            "type": "u64"
          },
          {
            "name": "created_ts",
            "docs": [
              "When the match was opened. `start_ts` is when it went live, which is a",
              "different moment and is zero until somebody joins — so \"opened 3m ago\"",
              "had nowhere to come from and was being decoded out of `match_id`, whose",
              "scale differed between the app and the seeder."
            ],
            "type": "i64"
          },
          {
            "name": "start_ts",
            "type": "i64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "entry",
            "docs": [
              "Per-player entry, in lamports."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "MatchStatus"
              }
            }
          },
          {
            "name": "pot",
            "docs": [
              "Total escrowed: entry * 2."
            ],
            "type": "u64"
          },
          {
            "name": "winner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "pnl_a_bps",
            "type": "i64"
          },
          {
            "name": "pnl_b_bps",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "MatchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Open"
          },
          {
            "name": "Live"
          },
          {
            "name": "Settling"
          },
          {
            "name": "Settled"
          },
          {
            "name": "Cancelled"
          }
        ]
      }
    },
    {
      "name": "PlayerStats",
      "docs": [
        "Lifetime record for one wallet, updated at settlement.",
        "",
        "The leaderboard was being aggregated client-side by scanning every tape,",
        "which is O(all matches) per render and cannot be trusted by anything other",
        "than the client doing the scanning. This is the on-chain source of truth."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "losses",
            "type": "u32"
          },
          {
            "name": "taken",
            "docs": [
              "Lamports won, net of rake."
            ],
            "type": "u64"
          },
          {
            "name": "staked",
            "docs": [
              "Lamports staked across all matches."
            ],
            "type": "u64"
          },
          {
            "name": "streak",
            "docs": [
              "Current consecutive wins."
            ],
            "type": "u32"
          },
          {
            "name": "best_streak",
            "docs": [
              "Best streak ever reached."
            ],
            "type": "u32"
          },
          {
            "name": "last_played_ts",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Position",
      "docs": [
        "Per-player trading state. Delegated to an ER and made private via the",
        "permission program while the match is Live — this is the account whose",
        "unreadability is the entire product."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "match_key",
            "type": "pubkey"
          },
          {
            "name": "quote_balance",
            "docs": [
              "Virtual quote currency, seeded from the entry. Lamports."
            ],
            "type": "i64"
          },
          {
            "name": "base_qty",
            "docs": [
              "Net base held, scaled by BASE_SCALE. Signed: long only for the MVP,",
              "but the type allows shorts without a migration."
            ],
            "type": "i64"
          },
          {
            "name": "avg_px",
            "docs": [
              "Volume-weighted average entry price, in the same scale as `px`."
            ],
            "type": "u64"
          },
          {
            "name": "realized",
            "docs": [
              "Realized PnL in quote units. Lamports."
            ],
            "type": "i64"
          },
          {
            "name": "last_px",
            "type": "u64"
          },
          {
            "name": "fill_count",
            "type": "u16"
          },
          {
            "name": "window_quote",
            "docs": [
              "The quote and base this position held immediately before `fills[0]`.",
              "",
              "`fills` keeps only the last MAX_FILLS. Without these, a busy round's",
              "tape held its last sixteen fills and nothing about where they started,",
              "so a replay from the entry drew a curve that ended somewhere the chain",
              "never was. Every fill that falls off the front is folded in here first,",
              "which makes this snapshot plus `fills` the whole round again."
            ],
            "type": "i64"
          },
          {
            "name": "window_base",
            "type": "i64"
          },
          {
            "name": "fills",
            "type": {
              "vec": {
                "defined": {
                  "name": "Fill"
                }
              }
            }
          },
          {
            "name": "book",
            "docs": [
              "This player's own private book. Inside the Position, so the permission",
              "that seals the position seals the book with it."
            ],
            "type": {
              "defined": {
                "name": "Book"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "PriceFeed",
      "docs": [
        "The mark one player trades against.",
        "",
        "There used to be a single feed per match, so that neither side could be",
        "quoted a different price than the other. That guarantee only meant anything",
        "while both sides traded the same token; now each player brings their own",
        "market, so there is one feed per player, seeded `[b\"feed\", match, owner]`.",
        "The protection that mattered survives in a stronger form: a player's fills",
        "are priced by the feed for the token they actually chose, and nothing else",
        "can write it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "match_key",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Which player's market this prices."
            ],
            "type": "pubkey"
          },
          {
            "name": "px",
            "docs": [
              "Scaled by PRICE_SCALE."
            ],
            "type": "u64"
          },
          {
            "name": "updated_ts",
            "type": "i64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "RoundStatus",
      "docs": [
        "What the whole world may know about a round in progress.",
        "",
        "Every Position is sealed by an ACL, which is the point of the product — so",
        "there was nowhere to publish a fact that both players are *supposed* to",
        "see. A liquidation is exactly that fact: a blow-up is announced, by",
        "decision, even though position contents never are.",
        "",
        "Deliberately carries no permission account. It is delegated to the rollup so",
        "`liquidate` can write it, and served to anyone who asks — the same shape as",
        "the unsealed control account `check:gate` probes to show that the gate",
        "discriminates rather than simply refusing everything."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "match_key",
            "type": "pubkey"
          },
          {
            "name": "liquidated_a",
            "docs": [
              "Set when that side was force-closed for running out of equity."
            ],
            "type": "bool"
          },
          {
            "name": "liquidated_b",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "SessionToken",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "target_program",
            "type": "pubkey"
          },
          {
            "name": "session_signer",
            "type": "pubkey"
          },
          {
            "name": "valid_until",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Buy"
          },
          {
            "name": "Sell"
          },
          {
            "name": "Settle"
          },
          {
            "name": "Liquidation"
          }
        ]
      }
    },
    {
      "name": "Tape",
      "docs": [
        "The public record written at settlement. World-readable forever."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "match_key",
            "type": "pubkey"
          },
          {
            "name": "leg_a",
            "docs": [
              "What each side traded. The tape is the public record of a duel, and a",
              "record that does not say which markets it was is not much of a record.",
              "Two legs now, because the players no longer share one."
            ],
            "type": {
              "defined": {
                "name": "Leg"
              }
            }
          },
          {
            "name": "leg_b",
            "type": {
              "defined": {
                "name": "Leg"
              }
            }
          },
          {
            "name": "liquidated_a",
            "docs": [
              "Whether either side ended by being force-closed rather than by trading."
            ],
            "type": "bool"
          },
          {
            "name": "liquidated_b",
            "type": "bool"
          },
          {
            "name": "player_a",
            "type": "pubkey"
          },
          {
            "name": "player_b",
            "type": "pubkey"
          },
          {
            "name": "pnl_a_bps",
            "type": "i64"
          },
          {
            "name": "pnl_b_bps",
            "type": "i64"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "pot_paid",
            "type": "u64"
          },
          {
            "name": "rake",
            "type": "u64"
          },
          {
            "name": "settled_ts",
            "type": "i64"
          },
          {
            "name": "start_quote_a",
            "docs": [
              "Where each side's stored fills begin, and how many fills it made in",
              "all. When `fill_count_*` exceeds the stored list the earliest fills are",
              "gone, and `start_quote_*` / `start_base_*` — the position just before",
              "the first stored fill — are what let a replay start from the right place."
            ],
            "type": "i64"
          },
          {
            "name": "start_base_a",
            "type": "i64"
          },
          {
            "name": "fill_count_a",
            "type": "u16"
          },
          {
            "name": "start_quote_b",
            "type": "i64"
          },
          {
            "name": "start_base_b",
            "type": "i64"
          },
          {
            "name": "fill_count_b",
            "type": "u16"
          },
          {
            "name": "fills_a",
            "type": {
              "vec": {
                "defined": {
                  "name": "Fill"
                }
              }
            }
          },
          {
            "name": "fills_b",
            "type": {
              "vec": {
                "defined": {
                  "name": "Fill"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Treasury",
      "docs": [
        "Protocol rake destination."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Vault",
      "docs": [
        "Escrow. A program-owned account so settlement can move lamports out of it",
        "by direct mutation; a system-owned PDA could not."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "match_key",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};

export default FOGDUEL_IDL;
