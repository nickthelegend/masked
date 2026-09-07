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
        "against private state."
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
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "The player's position — and, inside it, the player's own private book.",
            "Delegated to the rollup, so a fill moves that book there and never on a",
            "public venue."
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
                "kind": "account",
                "path": "player"
              }
            ]
          }
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
        "One at a time, deliberately. A Position is 543 bytes, so two of them do",
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
      "args": []
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
        "Post a new mark.",
        "",
        "One feed per match, so both players are always quoted the same price —",
        "an asymmetric feed would be an exploit on its own.",
        "",
        "Permissionless. The obvious alternative, letting only the creator post,",
        "is worse: it hands one player the power to time the mark against the",
        "other. With anyone able to post, the defence is the rate limit rather",
        "than the identity — at most MAX_PUSH_BPS per MIN_PUSH_INTERVAL, so a",
        "player who wants the mark somewhere else has to walk it there in",
        "public, a step at a time, while their opponent watches and trades.",
        "",
        "This is a stand-in for an oracle, and it is the one place where the",
        "round trusts something off-chain. For a major, the replacement is a",
        "Pyth price update, which is signed and needs no rate limit."
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
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "px",
          "type": "u64"
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
      "name": "MatchStillRunning",
      "msg": "Match has not reached its end time"
    },
    {
      "code": 6005,
      "name": "MatchExpired",
      "msg": "Match clock has already expired"
    },
    {
      "code": 6006,
      "name": "NotAParticipant",
      "msg": "Not a participant in this match"
    },
    {
      "code": 6007,
      "name": "InsufficientQuote",
      "msg": "Insufficient quote balance for this fill"
    },
    {
      "code": 6008,
      "name": "InsufficientBase",
      "msg": "Insufficient base quantity for this fill"
    },
    {
      "code": 6009,
      "name": "ZeroQuantity",
      "msg": "Fill quantity must be greater than zero"
    },
    {
      "code": 6010,
      "name": "InvalidPrice",
      "msg": "Price feed is not initialized or is stale"
    },
    {
      "code": 6011,
      "name": "InvalidDuration",
      "msg": "Duration out of allowed range"
    },
    {
      "code": 6012,
      "name": "InvalidEntry",
      "msg": "Entry amount must be greater than zero"
    },
    {
      "code": 6013,
      "name": "MathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6014,
      "name": "VaultUnderfunded",
      "msg": "Vault has insufficient lamports"
    },
    {
      "code": 6015,
      "name": "PriceTooSoon",
      "msg": "Price posted too soon after the last one"
    },
    {
      "code": 6016,
      "name": "PriceJump",
      "msg": "Price moved further in one push than the rate limit allows"
    },
    {
      "code": 6017,
      "name": "DrawAlreadySettled",
      "msg": "This market draw has already been settled"
    },
    {
      "code": 6018,
      "name": "DrawNotSettled",
      "msg": "This market draw has not been settled yet"
    },
    {
      "code": 6019,
      "name": "DrawAlreadyUsed",
      "msg": "This market draw has already opened a match"
    },
    {
      "code": 6020,
      "name": "NotTheDrawOpener",
      "msg": "Not the wallet that opened this draw"
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
            "name": "mint",
            "docs": [
              "The token being traded. Informational for the demo — positions are",
              "virtual inventory, so no SPL transfer happens mid-round."
            ],
            "type": "pubkey"
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
            "name": "market_type",
            "docs": [
              "Meme or Major. Decides how the mark is produced at settlement."
            ],
            "type": {
              "defined": {
                "name": "MarketType"
              }
            }
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
        "The mark price both players trade against. One feed per match, so neither",
        "side can be quoted a different price than the other."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "match_key",
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
            "name": "mint",
            "docs": [
              "What was traded. The tape is the public record of a duel, and a record",
              "that does not say which market it was is not much of a record — the",
              "feed had to fall back to naming every past duel after a demo mint."
            ],
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
