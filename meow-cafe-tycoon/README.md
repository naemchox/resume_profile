# Meow Meow Café Tycoon — Roblox tycoon in Luau

A Roblox café tycoon where the customers are animals. Players run a shop, make menu items at
stations, serve customers who queue at the counter, and spend coins on upgrades.

**Status: work in progress.** The map, the core loop with four animal types, server-side
saves and upgrades are built and have been tested in Studio. Friend-help is written but not
yet tested, and monetisation, offline income and the retention features are still planned.

**Stack** — Luau · Roblox Studio · Rojo (`default.project.json`) · DataStore

Original Thai planning notes: [`PLAN.md`](./PLAN.md) and
[`Meow Meow Café Tycoon.md`](./Meow%20Meow%20Caf%C3%A9%20Tycoon.md) (game design, monetisation
and 4-week plan). Both are in Thai.

---

## Progress

Done (per `PLAN.md`):

- **Map** — central plaza plus six player plots, generated from code
- **Core loop** — customers walk in, queue, order; the player makes the item at a station,
  serves it, and earns coins; customers sit at open tables
- **Animals** — cat (baseline), dog (impatient, tips for fast service), panda (orders 2-3
  items, pays x1.5), unicorn (rare, pays x10, announced to the whole server)
- **Saves** — coins and upgrade levels persist per player
- **Upgrades** — speed, seats, price, bought through an on-screen menu or an in-shop kiosk
- **Automatic shop assignment** — a player gets the lowest-numbered free plot on join and
  spawns in front of it

Written but not yet tested:

- **Friend-help** — walk to another player's counter, accept a "Help serve?" prompt, earn a
  bonus; the owner is notified and can remove helpers

Planned, not started:

- Game passes and developer products, decorations, offline income
- More menu items and rabbit / other rare customers
- Daily login reward, level-based unlocks, weekly events
- Sound IDs (`Config.Sounds.Coin`, `Config.Sounds.Unicorn` are still empty)
- Playtest with 10-20 friends and measure retention

## Layout

```
default.project.json         Rojo mapping into ReplicatedStorage / ServerScriptService / StarterPlayerScripts
PLAN.md                      Map plan, systems plan, per-step status and decisions (Thai)
Meow Meow Café Tycoon.md     Game design, monetisation, 4-week plan (Thai)
src/
  shared/
    Config.luau              All tunable numbers: menus, animals, upgrades, data store name, debug switches
    Upgrades.luau            Upgrade formulas, used by the server for effect and by the client for display
    HelpZone.luau            Counter-zone check shared by server and client for friend-help
  server/
    Main.server.luau         Entry point
    Map/                     Procedural plaza and shop construction (Plaza, Shop, Palette, Util)
    Game/
      PlotService            Plot assignment, ownership, signage
      CustomerService        Spawning, queueing, ordering, seating, walking, patience
      AnimalModels           Animal models built from parts in code
      StationService         Making and serving menu items, trash bin
      Economy                Coins and leaderstats
      DataService            DataStore load / save
      UpgradeService         Purchase validation and effects
      HelpService, Announce  Friend-help and server-wide announcements
  client/
    CoinHud, UpgradeMenu, HelpPopup, Announcement, InviteButton   UI scripts
```

## Running locally

1. Install [Rojo](https://rojo.space) and the Rojo plugin for Roblox Studio.
2. From this folder run `rojo serve`, then connect from the plugin in an empty place.
3. Press Play.

To test saving in Studio, enable Game Settings > Security > **Enable Studio Access to API
Services**. For 6 players per server set Max Players to 6 in Experience Settings.

Test switches live in `Config.Debug` (`ForceUnicorn`, `ResetData`, `StartCoins`) and only
take effect inside Studio.

## Constraints / design notes

- **Server owns the money.** Clients send only an upgrade name (`BuyUpgrade` RemoteFunction);
  the server validates level, cost and balance. The announcement remote is server-to-client
  only.
- **Safe saving.** Player data is `{ version, coins, upgrades }`, written with `UpdateAsync`
  (not `SetAsync`) and guarded by a per-server lock with a 120 s timeout so two servers do
  not save over each other. Loading retries; if it still fails the player can play but the
  stored data is not overwritten. Saves run every 60 s, on leave and on server close. Studio uses a separate store name so test data does not mix with live data.
- **One config file.** Every gameplay number is in `src/shared/Config.luau`; the upgrade
  formulas in `Upgrades.luau` are shared so the menu displays exactly what the server applies.
- **Ethics rule from the design doc.** The rare unicorn is a free random spawn only; selling
  chances to see it for real money is explicitly ruled out, as is penalising players who do
  not log in.
- **World built in code.** The map and animals are constructed from parts by script rather
  than imported assets, so the project has no binary dependencies and no third-party models.
