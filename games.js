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

    /* ── Additional Content: Eaglercraft / MC skins ──────────────────────────
       Folder holding the skin .png files, and the list of skins to show.
       To add a skin: drop the .png in the folder below and add its filename
       here. The display name is derived automatically from the filename.     */
    skinsPath: 'Assets/Images/Eaglercraft/Skins/',
    skins: [
        'bob.png', 'bsod.png', 'Cat.png', 'ChickenTux.png', 'commandblock.png',
        'crocodile.png', 'diamond.png', 'Dog.png', 'ducktux.png', 'Galaxy.png',
        'GreenShirtSteve.png', 'Jukebox.png', 'Ninja.png', 'PigTux.png',
        'RainbowGradient.png', 'RedShirtSteve.png', 'Redstone.png', 'SnowGolem.png',
        'SpiderTux.png', 'Swedish.png', 'Tnt.png', 'underwater.png', 'Villager.png',
        'IronGolem.png', 'Capybara.png', 'Spiderman.png',
    ],

    /* ── Icons for the Eaglercraft DLC sections ─────────────────────────────── */
    eaglercraftIcon:   'Assets/Images/Eaglercraft.png',
    resourcepacksIcon: 'Assets/Images/EaglercraftResourcepacks.png',

    /* ── Additional Content: Eaglercraft Resource Packs ──────────────────────
       Folder holding the resource pack .zip files, and the list to show.
       The card preview is the "pack.png" pulled straight out of each zip.
       To add a pack: drop the .zip in the folder below and add a block here.
         name        : shown as the title
         file        : the .zip filename inside resourcepacksPath
         description : shown in the popup (edit freely)
         credits     : link shown in the popup (edit freely)
         top         : optional, set true to pin it to the top of the list      */
    resourcepacksPath: 'AdditionalContent/Eaglercraft/Resourcepacks/',
    resourcePacks: [
        {
            name:        'Modern Textures',
            file:        'ModernTextures.zip',
            description: 'Replaces the old textures with the newer ones as seen in the newer versions of Minecraft.',
            credits:     'https://www.curseforge.com/minecraft/texture-packs/new-textures',
            top:         true,
        },
        {
            name:        'Glowing Ore Borders',
            file:        'GlowOreBorder.zip',
            description: 'Simply makes the ore borders like diamonds glow.',
            credits:     'https://modrinth.com/project/26bFJKVz',
        },
        {
            name:        'Small Shield/ Small Totem',
            file:        'SmallShieldAndTotem.zip',
            description: 'Makes your shield and totem small, good for pvp.',
            credits:     'https://modrinth.com/project/LSBNL0rO',
        },
        {
            name:        'PvP crosshair',
            file:        'PvPCrosshair.zip',
            description: 'Makes your crosshair look more PvP styled.',
            credits:     'https://modrinth.com/project/uFGhGxal',
        },
        {
            name:        'Bare Bones',
            file:        'BareBones.zip',
            description: 'Gives Minecraft the trailer look.',
            credits:     'https://modrinth.com/project/rox3U8B6',
        },
        {
            name:        'Low Fire',
            file:        'LowFire.zip',
            description: 'Makes fire on screen take up less space.',
            credits:     'https://modrinth.com/project/RRxvWKNC',
        },
        {
            name:        'Dark Mode',
            file:        'DefaultDarkMode.zip',
            description: 'Makes the interface dark, easy on da eyes.',
            credits:     'https://modrinth.com/project/6SLU7tS5',
        },
    ],

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

            /* Eaglercraft ships in two versions. Picking Download asks which one.
               Edit the label / blurb / file freely.  file is Base64 of the zip
               name (encode with btoa('name.zip') in your browser console).      */
            versions: [
                {
                    label: '1.8.8',
                    file:  'ZWFnbGVyY3JhZnQuemlw',           // btoa('eaglercraft.zip')
                    blurb: 'The classic and most stable version. Runs smooth and is great for skins and older servers.',
                },
                {
                    label: '1.12.2',
                    file:  'MS4xMi4yLnppcA==',                // btoa('1.12.2.zip')
                    blurb: 'A bit more buggier but is more modern and has shields and stuff.',
                },
            ],

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
            file: 'cGFpbnQuemlw', // btoa('paint.zip')
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

                  {
            name:        'GeometryDashLite',
            file: 'R2VvbWV0cnlEYXNoTGl0ZS56aXA=', // btoa('GeometryDashLite.zip')
            category:    'Game',
            type:        'Arcade',
            cardText:    'Jump as a cube and avoid spikes.',
            description: 'Geometry dash, the game where you jump as a cube and avoid spikes.',

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
