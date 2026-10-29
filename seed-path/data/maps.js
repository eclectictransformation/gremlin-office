/* The Seed Path: area maps.
   Each map is 20 x 15 tiles. Edit the strings freely; keep every row 20 characters.
   Tile legend:
     .  grass          ,  flowers        =  path         L  lantern-lit path (Grove)
     R  reeds          M  mushrooms      (all of the above are walkable)
     #  trees          ^  hill (scenery) ~  water        r  rock        T  bush
     h  cottage wall   o  cottage door   f  fence/line   l  lantern     b  bench
     g  the sleeping hedge in front of Seed Hill (opens when your friends are with you)
   Walking off an open edge takes you to the neighbouring area named in `exits`
   (N/S keep your column, E/W keep your row, so openings must line up).
   `slot`        where this area's Kin waits.
   `followTo`    where a "follow slowly" Kin leads you.
   `hide`        spots where a lost thing can be tucked away.
   `objects`     signs, the mailbox, benches and little things you can look at.
*/
window.SEED = window.SEED || {};
SEED.maps = {
  nook: {
    name: "Portal Nook", tint: null,
    exits: { N: "meadow" },
    rows: [
      "#########==#########",
      "#########==#########",
      "####,,...==...,,####",
      "###,.....==.....,###",
      "##,......==......,##",
      "##.......==.......##",
      "##...,...==...,...##",
      "##.......==.......##",
      "##.......==.......##",
      "###......==......###",
      "####.....==.....####",
      "#####....==....#####",
      "######........######",
      "#######......#######",
      "####################"
    ],
    start: [10, 11],
    objects: [
      { kind: "look", x: 1, y: 8, lines: ["Someone has carved GO SLOW into this tree, very neatly, with a little heart."] },
      { kind: "portal", x: 9, y: 13, solid: true, lines: ["The loose sock is still swaying a little.", "It will take you back whenever you like. Try the menu button."] },
      { kind: "sign", x: 7, y: 9, icon: "leaf", lines: ["THE HOLLOWMERE", "Walk slowly. Nothing here is in a hurry."] },
      { kind: "look", x: 17, y: 3, lines: ["A tree with one sock hanging from a branch.", "It looks like it has been there a long time, and is fine with that."] }
    ]
  },

  meadow: {
    name: "Mossy Meadow", tint: null, where: "in the middle of everything",
    exits: { S: "nook", W: "hollow", E: "pond", N: "hill" },
    rows: [
      "^^^^^^^^^==^^^^^^^^^",
      "^^^^^^^^^gg^^^^^^^^^",
      "##,....,..==..,...##",
      "#.....,...==...,...#",
      "#..T.....====.....T#",
      "#,.....======.....,#",
      "#.....==....==.....#",
      "======..........====",
      "#.....==..b...==...#",
      "#..,...=======..,..#",
      "#.T.......==......T#",
      "#...,.....==..,....#",
      "#,........==.......#",
      "##.......,==,.....##",
      "#########==#########"
    ],
    slot: [5, 11], followTo: [16, 3], hide: [[17, 12], [2, 4], [16, 11]],
    objects: [
      { kind: "look", x: 0, y: 8, lines: ["A tree with a door the size of a thumb.", "You knock. Nobody's home, but it feels like they'd be glad you knocked."] },
      { kind: "look", x: 19, y: 12, lines: ["This tree is leaning very slightly, as if listening to the meadow."] },
      { kind: "sign", x: 15, y: 6, icon: "arrows", lines: ["West: Pebble Hollow (and the Lantern Grove beyond).", "East: Willow Pond.  North: Seed Hill.  South: the Portal Nook."] },
      { kind: "mailbox", x: 8, y: 3, lines: ["There's a note inside, in wobbly gremlin handwriting:", "\"Dear whoever. The hill has a seed spot. You will know it. Bring friends. Love, a gremlin.\""] },
      { kind: "bench", x: 10, y: 8, lines: ["A mossy bench. Sit for a few slow breaths?"], rest: true },
      { kind: "look", x: 3, y: 4, lines: ["A bush humming very quietly to itself.", "It stops when you look. Then starts again."] },
      { kind: "look", x: 18, y: 10, lines: ["Someone has tied a tiny ribbon around this bush.", "It is a very nice ribbon."] },
      { kind: "look", x: 12, y: 1, lines: ["Seed Hill, just beyond the hedge. There's a soft bare patch at the top, waiting."] }
    ]
  },

  hollow: {
    name: "Pebble Hollow", tint: null, where: "west of the meadow",
    exits: { E: "meadow", N: "grove" },
    rows: [
      "####==##############",
      "###.==.r..##########",
      "##..==....r..#######",
      "#r..==.......r######",
      "#...===.........r###",
      "#.r...==.....,....##",
      "#......==.r.......r#",
      "#.......============",
      "#..r....,.....r....#",
      "#.........M.......r#",
      "##.r.....,....M...##",
      "###...r.........r###",
      "####....r...r..#####",
      "######.......#######",
      "####################"
    ],
    slot: [13, 9], followTo: [6, 2], hide: [[2, 9], [15, 10], [3, 6]],
    objects: [
      { kind: "look", x: 1, y: 3, lines: ["A small rock balanced on a bigger rock, concentrating very hard."] },
      { kind: "look", x: 14, y: 8, lines: ["A pebble that looks exactly like a potato.", "It knows. It has made peace with it."] },
      { kind: "sign", x: 9, y: 6, icon: "pebble", lines: ["PEBBLE HOLLOW", "Please do not hurry the stones."] },
      { kind: "look", x: 7, y: 1, lines: ["A rock with a face drawn on it in chalk.", "Someone gave it eyebrows. It looks pleased."] },
      { kind: "look", x: 16, y: 11, lines: ["This rock is warm, like it has been in the sun all day.", "It has not. It is just like that."] }
    ]
  },

  pond: {
    name: "Willow Pond", tint: null, where: "east of the meadow",
    exits: { W: "meadow" },
    rows: [
      "####################",
      "##..,....R....,...##",
      "#....~~~~~~~~R.....#",
      "#..~~~~~~~~~~~~...,#",
      "#.~~~~~~~~~~~~~~...#",
      "#.~~~~~~~~~~~~~~R..#",
      "#..~~~~~~~~~~~~....#",
      "=====.R..~~~~~~....#",
      "#......R..~~~~..b..#",
      "#.R........R.......#",
      "#....,.......,..R..#",
      "##.....T.......T..##",
      "###..............###",
      "#####..........#####",
      "####################"
    ],
    slot: [8, 7], followTo: [15, 12], hide: [[17, 3], [3, 10], [17, 9]],
    objects: [
      { kind: "look", x: 2, y: 4, lines: ["A fish blows one bubble at you. Politely. Then swims off."] },
      { kind: "look", x: 15, y: 11, lines: ["A frog-shaped stone. Or a very, very patient frog."] },
      { kind: "bench", x: 16, y: 8, lines: ["A bench facing the water. Sit for a few slow breaths?"], rest: true },
      { kind: "look", x: 7, y: 11, lines: ["A small boat made of a leaf, resting in the bush.", "It seems to be on holiday."] },
      { kind: "look", x: 10, y: 4, lines: ["The pond is so still it is holding a copy of the sky."] }
    ]
  },

  grove: {
    name: "Lantern Grove", tint: "dusk", where: "north of Pebble Hollow",
    exits: { S: "hollow", N: "cottages" },
    rows: [
      "##############LL####",
      "#####...l.....LL.###",
      "####..LLLLLLLLLL.###",
      "###..lL.........l###",
      "###...L..####....###",
      "##....L.######....##",
      "##....LLLLLLLLL...##",
      "##.l..........L.l.##",
      "###.....###...L...##",
      "###..LLLLLLLLLL..###",
      "####.L....l.....####",
      "####.L..........####",
      "####LL..l..#########",
      "####LL.#############",
      "####LL##############"
    ],
    slot: [7, 11], followTo: [15, 1], preferLit: true, hide: [[16, 5], [2, 7], [12, 11]],
    objects: [
      { kind: "look", x: 16, y: 3, lines: ["This lantern is humming a lullaby, slightly off-key. It's doing its best."] },
      { kind: "look", x: 8, y: 1, lines: ["A lantern with a sock drying on top of it. Toasty."] },
      { kind: "look", x: 9, y: 4, lines: ["A hollow in the tree holds a tiny teacup, still a little warm."] },
      { kind: "sign", x: 7, y: 7, icon: "lantern", lines: ["LANTERN GROVE", "It is always a little bit evening here. That's on purpose."] },
      { kind: "look", x: 10, y: 10, lines: ["A lantern with a moth-shaped smudge on the glass.", "It hums like a kettle that's nearly ready."] }
    ]
  },

  cottages: {
    name: "Sock Cottages", tint: null, where: "north of the Lantern Grove",
    exits: { S: "grove" },
    rows: [
      "####################",
      "#.,hhhh....hhhh..,.#",
      "#..hhoh....hohh....#",
      "#....=......=.....,#",
      "#....========......#",
      "#.f.f.f.....=..T...#",
      "#...........=......#",
      "#..hhhh.....=.hhhh.#",
      "#..hhoh.....=.hhoh.#",
      "#.....==========...#",
      "#.T...........==.T.#",
      "#....,........==...#",
      "##............==..##",
      "###...........==.###",
      "##############==####"
    ],
    slot: [8, 6], followTo: [2, 11], hide: [[16, 11], [17, 3], [2, 6]],
    objects: [
      { kind: "look", x: 2, y: 10, lines: ["A bush trimmed into the shape of a sock.", "Not a very good sock. But trying."] },
      { kind: "sign", x: 9, y: 3, icon: "sock", lines: ["SOCK COTTAGES", "Odd socks welcome. All socks are a little odd."] },
      { kind: "look", x: 2, y: 5, lines: ["A washing line of socks, none of them matching.", "They look very happy about it."] },
      { kind: "look", x: 5, y: 8, lines: ["A tiny note on the door: \"Back soon. Or later. Either is good.\""] },
      { kind: "look", x: 12, y: 2, lines: ["Through the window: a teapot wearing a sock as a cosy."] }
    ]
  },

  hill: {
    name: "Seed Hill", tint: null, where: "north of the meadow",
    exits: { S: "meadow" },
    rows: [
      "####################",
      "####....,,,,....####",
      "###..,........,..###",
      "##................##",
      "##..,..........,..##",
      "#........==........#",
      "#..,.....==.....,..#",
      "#........==........#",
      "##.......==.......##",
      "##..,....==....,..##",
      "###......==......###",
      "###......==......###",
      "####.....==.....####",
      "#####....==....#####",
      "#########==#########"
    ],
    objects: [
      { kind: "look", x: 3, y: 1, lines: ["From up here the whole Hollowmere looks small and soft, like a quilt."] },
      { kind: "look", x: 16, y: 1, lines: ["A pinecone someone has wrapped in a tiny knitted scarf."] },
      { kind: "seed", x: 9, y: 3, solid: true, lines: [] }
    ]
  }
};
/* How much of the valley opens for each walk length. `kin` = how many friends to find. */
SEED.walks = {
  short:  { label: "A short stroll",   sub: "about 5 minutes, 2 shy friends",  kin: 2, areas: [["meadow", "pond"], ["meadow", "hollow"]] },
  medium: { label: "A gentle wander",  sub: "about 10 minutes, 3 shy friends", kin: 3, areas: [["meadow", "hollow", "pond"]] },
  long:   { label: "A long ramble",    sub: "about 15 minutes, 5 shy friends", kin: 5, areas: [["meadow", "hollow", "pond", "grove", "cottages"]] }
};
SEED.links = {
  arcade: "https://eclectictransformation.github.io/gremlin-office/preview-arcade/",
  meditation: "https://eclectictransformation.com/"   /* TODO: point at the Listen & Breathe page */
};
