/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/fogduel.json`.
 */
export type Fogduel = {
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
      "name": "applyFill",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "priceFeed",
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
                "path": "matchAccount"
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
                "path": "matchAccount"
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
              "name": "side"
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
      "name": "cancelIfUnjoined",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
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
                "path": "matchAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "commitAndUndelegatePositions",
      "docs": [
        "Commit both positions back to L1 and release the delegation.",
        "",
        "Called on the ER once the clock expires. After this lands the positions",
        "are readable on L1 again and `settle_match` can run."
      ],
      "discriminator": [
        60,
        74,
        124,
        47,
        150,
        143,
        25,
        25
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "positionA",
          "writable": true
        },
        {
          "name": "positionB",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createMatch",
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
          "name": "matchAccount",
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
                "path": "matchId"
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "priceFeed",
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchId",
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
          "name": "startPx",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePositionToEr",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "bufferPosition",
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
          "name": "delegationRecordPosition",
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
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPosition",
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
              "path": "delegationProgram"
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
                "path": "matchAccount"
              },
              {
                "kind": "arg",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
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
          "name": "commitFrequencyMs",
          "type": "u32"
        }
      ]
    },
    {
      "name": "initPositionPrivacy",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
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
                "path": "matchAccount"
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
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "permissionProgram",
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
      "name": "initTreasury",
      "docs": [
        "One-time protocol treasury init."
      ],
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinMatch",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "priceFeed",
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "positionA",
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
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "positionB",
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
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "joiner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
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
          "name": "baseAccount",
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
                "path": "baseAccount"
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "pushPrice",
      "docs": [
        "Push a new mark price. One feed per match, so both players are always",
        "quoted the same price — an asymmetric feed would be an exploit."
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
          "signer": true
        },
        {
          "name": "priceFeed",
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
                "path": "price_feed.match_key",
                "account": "priceFeed"
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
      "name": "requestSettle",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "settleMatch",
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
          "name": "matchAccount",
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
                "account": "match"
              },
              {
                "kind": "account",
                "path": "match_account.match_id",
                "account": "match"
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "priceFeed",
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "positionA",
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
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "match_account.creator",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "positionB",
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
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "position_b.owner",
                "account": "position"
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
                "path": "matchAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "match",
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
      "name": "position",
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
      "name": "priceFeed",
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
      "name": "tape",
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
      "name": "treasury",
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
      "name": "vault",
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
      "name": "matchNotOpen",
      "msg": "Match is not open for joining"
    },
    {
      "code": 6001,
      "name": "matchNotLive",
      "msg": "Match is not live"
    },
    {
      "code": 6002,
      "name": "matchNotSettling",
      "msg": "Match is not settling"
    },
    {
      "code": 6003,
      "name": "selfJoin",
      "msg": "Cannot join your own match"
    },
    {
      "code": 6004,
      "name": "matchStillRunning",
      "msg": "Match has not reached its end time"
    },
    {
      "code": 6005,
      "name": "matchExpired",
      "msg": "Match clock has already expired"
    },
    {
      "code": 6006,
      "name": "notAParticipant",
      "msg": "Not a participant in this match"
    },
    {
      "code": 6007,
      "name": "insufficientQuote",
      "msg": "Insufficient quote balance for this fill"
    },
    {
      "code": 6008,
      "name": "insufficientBase",
      "msg": "Insufficient base quantity for this fill"
    },
    {
      "code": 6009,
      "name": "zeroQuantity",
      "msg": "Fill quantity must be greater than zero"
    },
    {
      "code": 6010,
      "name": "invalidPrice",
      "msg": "Price feed is not initialized or is stale"
    },
    {
      "code": 6011,
      "name": "invalidDuration",
      "msg": "Duration out of allowed range"
    },
    {
      "code": 6012,
      "name": "invalidEntry",
      "msg": "Entry amount must be greater than zero"
    },
    {
      "code": 6013,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6014,
      "name": "vaultUnderfunded",
      "msg": "Vault has insufficient lamports"
    }
  ],
  "types": [
    {
      "name": "fill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
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
              "Execution price, scaled by PRICE_SCALE."
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
      "name": "match",
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
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "startTs",
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
                "name": "matchStatus"
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
            "name": "pnlABps",
            "type": "i64"
          },
          {
            "name": "pnlBBps",
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
      "name": "matchStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "live"
          },
          {
            "name": "settling"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "position",
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
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "quoteBalance",
            "docs": [
              "Virtual quote currency, seeded from the entry. Scaled by PRICE_SCALE."
            ],
            "type": "i64"
          },
          {
            "name": "baseQty",
            "docs": [
              "Net base held, scaled by BASE_SCALE. Signed: long only for the MVP,",
              "but the type allows shorts without a migration."
            ],
            "type": "i64"
          },
          {
            "name": "avgPx",
            "docs": [
              "Volume-weighted average entry price, scaled by PRICE_SCALE."
            ],
            "type": "u64"
          },
          {
            "name": "realized",
            "docs": [
              "Realized PnL in quote units, scaled by PRICE_SCALE."
            ],
            "type": "i64"
          },
          {
            "name": "lastPx",
            "type": "u64"
          },
          {
            "name": "fillCount",
            "type": "u16"
          },
          {
            "name": "fills",
            "type": {
              "vec": {
                "defined": {
                  "name": "fill"
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
      "name": "priceFeed",
      "docs": [
        "The mark price both players trade against. One feed per match, so neither",
        "side can be quoted a different price than the other."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
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
            "name": "updatedTs",
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
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          },
          {
            "name": "settle"
          }
        ]
      }
    },
    {
      "name": "tape",
      "docs": [
        "The public record written at settlement. World-readable forever."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
            "type": "pubkey"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "pnlABps",
            "type": "i64"
          },
          {
            "name": "pnlBBps",
            "type": "i64"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "potPaid",
            "type": "u64"
          },
          {
            "name": "rake",
            "type": "u64"
          },
          {
            "name": "settledTs",
            "type": "i64"
          },
          {
            "name": "fillsA",
            "type": {
              "vec": {
                "defined": {
                  "name": "fill"
                }
              }
            }
          },
          {
            "name": "fillsB",
            "type": {
              "vec": {
                "defined": {
                  "name": "fill"
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
      "name": "treasury",
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
      "name": "vault",
      "docs": [
        "Escrow. A program-owned account so settlement can move lamports out of it",
        "by direct mutation; a system-owned PDA could not."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchKey",
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
