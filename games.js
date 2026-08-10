/* ============================================================================
   NEBULAR LAUNCHER — GAME DOWNLOADER  ·  CONFIG
   ----------------------------------------------------------------------------
   This is the ONLY file you edit to add games / apps or change the Store.
   No other file needs to be touched.

   ── How to add a new game ──────────────────────────────────────────────────
   1. Drop the game's .zip inside the "Games/" folder on your GitHub Pages repo.
      (The zip MUST contain an "icon.png" at its root — that becomes the card
       artwork — and an "index.html" so it runs inside Nebular Launcher.)
   2. Copy one of the blocks in `items` below and fill it in.
   3. For "file", put the zip's filename Base64-ENCODED so the real name is not
      exposed in plain text. Encode it once in your browser console:
            btoa('YourGame.zip')      →  paste the result as "file"
      (Flappy Bird below is btoa('FlappyBird.zip') = 'RmxhcHB5QmlyZC56aXA=')

   ── Categories ─────────────────────────────────────────────────────────────
   category : 'Game'  or  'App'
   type     : if Game  → the genre  ('Arcade', 'Puzzle', 'Racing', 'Shooter'…)
              if App   → the kind   ('Utility', 'Tool', 'Creative'…)
   ============================================================================ */

const NEBULAR_CONFIG = {

    /* ── The Store (always shown, always embedded) ───────────────────────────
       Change this one line to point the Store at a different GitHub page.     */
    storeUrl:  'https://garebear5245-ux.github.io/solid-palm-tree/',
    storeIcon: 'Assets/Images/Store.png',

    /* Folder (relative to this site) that holds the .zip files. */
    gamesPath: 'Games/',

    /* ── The catalogue ───────────────────────────────────────────────────── */
    items: [
        {
            name:        'Flappy Bird',
            file:        'RmxhcHB5QmlyZC56aXA=',          // btoa('FlappyBird.zip')
            category:    'Game',
            type:        'Arcade',
            cardText:    'Tap to flap through the pipes.',
            description: 'The classic one-button arcade challenge. Guide your ' +
                         'bird between an endless run of pipes — one tap keeps ' +
                         'it in the air, gravity does the rest. Chase a new high ' +
                         'score and earn medals along the way.',
            tags: {
                achievements: true,    // has in-game achievements / medals
                offline:      true,    // playable with no internet
                broken:       false,   // known to be buggy / unfinished
                multiplayer:  false,   // has a multiplayer mode
                controller:   false,   // supports a gamepad
            },
        },

               {
            name:        'BrickBox',
            file: 'QnJpY2tCb3guemlw', // btoa('BrickBox.zip')
            category:    'Game',
            type:        'Sandbox',
            cardText:    'Physics Sandbox game to mess around in.',
            description: 'A physics like sandbox game where you can play with friends ' +
                         'and save maps and battle. ' +
                         'However, this is a expiriment and may not work properly.',

            tags: {
                achievements: false,    // has in-game achievements / medals
                offline:      false,    // playable with no internet
                broken:       true,   // known to be buggy / unfinished
                multiplayer:  true,   // has a multiplayer mode
                controller:   false,   // supports a gamepad
            },
        },

               {
            name:        'Eaglercraft',
            file: 'ZWFnbGVyY3JhZnQuemlw', // btoa('eaglercraft.zip')
            category:    'Game',
            type:        'Sandbox',
            cardText:    'The iconic game Minecraft but in the browser ',
            description: 'Its literally just Minecraft just runs in the browser. ' +
                         'Credits:  ' ,
                         
            tags: {
                achievements: false,    // has in-game achievements / medals
                offline:      true,    // playable with no internet
                broken:       false,   // known to be buggy / unfinished
                multiplayer:  true,   // has a multiplayer mode
                controller:   false,   // supports a gamepad
            },
        },

                  {
            name:        'Paint',
            file: 'ZWFnbGVyY3JhZnQuemlw', // btoa('eaglercraft.zip')
            category:    'App',
            type:        'Creativity',
            cardText:    'Draw things ',
            description: 'Draw stuff and export them with a photoshop like editor. ' +
                         'Credits: https://github.com/viliusle/miniPaint ' ,
                         
            tags: {
                achievements: false,    // has in-game achievements / medals
                offline:      true,    // playable with no internet
                broken:       false,   // known to be buggy / unfinished
                multiplayer:  false,   // has a multiplayer mode
                controller:   false,   // supports a gamepad
            },
        },

        /* ── Copy this block to add another game or app ──────────────────────
        {
            name:        'My New Game',
            file:        'PASTE_BASE64_OF_THE_ZIP_NAME',
            category:    'Game',                 // or 'App'
            type:        'Puzzle',               // genre (Game) or kind (App)
            cardText:    'One short line for the card.',
            description: 'A longer description shown when the card is opened.',
            tags: { achievements: false, offline: true, broken: false, multiplayer: false, controller: false },
        },
        */
    ],
};
