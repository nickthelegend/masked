# Compressed tapes, end to end (PLAN 7.18 #82)

Branch `compressed-tapes`: fogduel on anchor-lang 1.2.0 (MagicBlock SDK `anchor-modern`), with light-sdk 0.25
and a new `archive_tape` instruction that stores a settled tape's result as a Light compressed account at an
address derived from `["tape", match]`. Nothing here is deployed; it runs on Light's local validator.

    cd chain/programs/fogduel && cargo build-sbf --sbf-out-dir ../../target/deploy
    cargo install --git https://github.com/lightprotocol/photon.git --rev 52ca110cf8e3d5aca6e65e1ef8e98b7632d3a16f --locked
    cd chain/light-e2e && npm install
    npx light test-validator --sbf-program 3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1 ../target/deploy/fogduel.so
    npm run e2e    # settles a round, archives its tape, reads it back through Photon, compares with the PDA

`fogduel-idl.json` is the current (0.32) IDL: the instructions the script calls before `archive_tape` are
unchanged, and anchor 1.2 derives the same instruction and account discriminators. `archive_tape` itself is
encoded by hand in the script.
