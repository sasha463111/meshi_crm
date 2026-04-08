#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd "/Users/sashadibka/meshi textile/one-stop-shop"
exec npx next dev -p 3000
