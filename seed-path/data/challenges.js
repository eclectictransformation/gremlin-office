/* The Seed Path: riddles, tiny puzzles, and how each Kin talks.
   Wording from the Meditation Guide notes (Oct 29). Calm rules: no fail states,
   no timers shown, hints after 2 tries or ~45s idle, "Tell me the answer" after hint 3.
   tier: easy | medium | harder.  Riddle answers are matched case-insensitively. */
window.SEED = window.SEED || {};
SEED.riddles = [
  { id: "r-rain", tier: "easy", q: "I fall but never get hurt. I tap on windows and help gardens grow.", a: ["rain", "rainfall", "raindrop", "raindrops", "rain drops", "drizzle", "showers"], show: "rain",
    hints: ["I come from clouds.", "I make puddles."], choices: [["\u{1F327}\uFE0F", "rain"], ["\u{1F331}", "a sprout"], ["\u{1F40C}", "a snail"]] },
  { id: "r-steps", tier: "easy", q: "The more of me you take, the more of me you leave behind.", a: ["footsteps", "footstep", "steps", "step", "footprints", "footprint", "foot prints", "foot steps", "tracks"], show: "footsteps",
    hints: ["You're making some right now.", "Look down at the path."], choices: [["\u{1F463}", "footsteps"], ["\u{1F36A}", "cookies"], ["\u{1F4F7}", "photos"]] },
  { id: "r-shadow", tier: "easy", q: "I follow you all day in the sun, but I vanish at night.", a: ["shadow", "shadows", "my shadow", "your shadow"], show: "a shadow",
    hints: ["I'm dark, but friendly.", "I'm shaped like you."], choices: [["\u{1F465}", "a shadow"], ["\u{1F431}", "a cat"], ["\u{1F31E}", "the sun"]] },
  { id: "r-river", tier: "easy", q: "I have a mouth but never eat, and a bed but never sleep.", a: ["river", "a river", "stream", "a stream", "creek", "brook", "rivers"], show: "a river",
    hints: ["I'm always moving.", "Fish live in me."], choices: [["\u{1F30A}", "a river"], ["\u{1F6CF}\uFE0F", "a bed"], ["\u{1F438}", "a frog"]] },
  { id: "r-seed", tier: "medium", q: "Plant me in your palm today, and someday I might be a forest.", a: ["seed", "a seed", "seeds", "acorn", "an acorn", "pinecone", "pine cone", "nut"], show: "a seed",
    hints: ["I'm very small.", "Gardeners plant me."], choices: [["\u{1F330}", "a seed"], ["\u{1FAA8}", "a pebble"], ["\u{1F41A}", "a shell"]] },
  { id: "r-breath", tier: "medium", q: "I'm light as a feather, but no one can hold me for long.", a: ["breath", "a breath", "your breath", "breathing", "air", "breaths"], show: "a breath",
    hints: ["You're doing it right now.", "In, then out."], choices: [["\u{1F32C}\uFE0F", "a breath"], ["\u{1FAB6}", "a feather"], ["\u2601\uFE0F", "a cloud"]] },
  { id: "r-sponge", tier: "medium", q: "I'm full of holes, but I still hold water.", a: ["sponge", "a sponge", "sponges"], show: "a sponge",
    hints: ["You'd find me by a sink.", "I'm squishy."], choices: [["\u{1F9FD}", "a sponge"], ["\u{1FAA3}", "a bucket"], ["\u{1F9C0}", "cheese"]] },
  { id: "r-book", tier: "medium", q: "I have leaves but I'm not a tree, and a spine but I'm not a fish.", a: ["book", "a book", "books", "notebook", "journal"], show: "a book",
    hints: ["You read me.", "Vesper loves me."], choices: [["\u{1F4D6}", "a book"], ["\u{1F335}", "a cactus"], ["\u{1F995}", "a dinosaur"]] },
  { id: "r-towel", tier: "medium", q: "I get wetter the more I dry.", a: ["towel", "a towel", "towels", "bath towel", "tea towel", "dish towel", "cloth"], show: "a towel",
    hints: ["You use me after a bath.", "I'm soft and fluffy."], choices: [["", "a towel"], ["\u2602\uFE0F", "an umbrella"], ["\u2600\uFE0F", "the sun"]] },
  { id: "r-fog", tier: "harder", q: "The more of me there is, the less you see.", a: ["fog", "darkness", "dark", "the dark", "mist", "the fog", "haze", "night"], show: "fog",
    hints: ["I like early mornings.", "I'm a cloud that came down to visit."], choices: [["\u{1F32B}\uFE0F", "fog"], ["\u{1F319}", "the moon"], ["\u{1F56F}\uFE0F", "a candle"]] },
  { id: "r-name", tier: "harder", q: "It belongs to you, but other people use it more than you do.", a: ["name", "your name", "my name", "a name", "names", "nickname"], show: "your name",
    hints: ["Your Gremlin has one.", "Friends call you by it."], choices: [["\u{1F3F7}\uFE0F", "your name"], ["\u{1F9E2}", "your cap"], ["\u{1F511}", "your key"]] },
  { id: "r-silence", tier: "harder", q: "Say my name and I disappear.", a: ["silence", "quiet", "the quiet", "quietness", "stillness", "hush"], show: "silence",
    hints: ["I live in the Quiet Room.", "Shhh..."], choices: [["\u{1F92B}", "silence"], ["\u{1F47B}", "a ghost"], ["\u{1FAE7}", "a bubble"]] }
];
SEED.puzzles = [
  { id: "p-stones", tier: "easy", type: "stones", title: "Stepping stones",
    hints: ["Each stone is a hop. Put one in every column of water.", "Neighbouring stones should be close: the same row, or one row up or down.", "A straight line across the middle works nicely."] },
  { id: "p-shadow", tier: "easy", type: "shadow", title: "Shadow match",
    hints: ["Look at the outline of each shadow.", "The feather's shadow is long and thin.", "The shell's shadow is round with a little fan of lines."] },
  { id: "p-lantern", tier: "easy", type: "lantern", title: "Lantern line",
    hints: ["Start with the very smallest lantern.", "Each one you light should be a little bigger than the last.", "The biggest lantern is the last one to light."] },
  { id: "p-water", tier: "easy", type: "guide", title: "A drink of water",
    hints: ["The seed can't roll through stones. Look for a way around.", "Try rolling down first, then across.", "Down, right, right, right, up, up, right... or any way around the stones."] },
  { id: "p-pipes", tier: "medium", type: "pipes", title: "Bamboo pipes",
    hints: ["Tap a pipe to turn it.", "Water comes in from the spring on the left.", "Follow the water one pipe at a time: in from the left, down, then across to the sprout."] },
  { id: "p-pebbles", tier: "medium", type: "pebbles", title: "Pebble fade",
    hints: ["Tap two pebbles to swap them.", "Find the very lightest pebble and put it on the left.", "Then the next lightest beside it, and so on, to the darkest on the right."] },
  { id: "p-chime", tier: "medium", type: "chime", title: "Chime echo",
    hints: ["Tap \u201CPlay again\u201D as many times as you like.", "Watch which chime glows first. Sound isn't needed.", "The order is shown below the chimes now."] },
  { id: "p-lily", tier: "harder", type: "lily", title: "Lily pad hop",
    hints: ["The frog can hop to any pad that touches it, even corner to corner.", "Reeds can't hold a lily pad. Go above or below them.", "Try a pad in each column, all along the bottom, then step up to the Kin."] },
  { id: "p-moss", tier: "harder", type: "moss", title: "Moss tiles",
    hints: ["Tap a tile next to the empty space to slide it in.", "Look for the tile that belongs in the bottom-right corner.", "Only a few slides are needed. If you get muddled, go back the way you came."] }
];

/* Five personalities from the Guide, shared across all 30 Kin.
   first = the lonely ask-to-join (no puzzle), ask = before the puzzle, join = after, walk = light banter. */
SEED.voices = {
  quiet: { label: "shy and quiet",
    first: ["Oh... you're traveling alone? Would you like some company? I'm quiet, but I'm a very good listener."],
    ask: ["Oh. Hello. I'd like to come along too... I made up a little something for you first. Is that alright?"],
    join: ["You got it. I knew you would. ...May I walk beside you?"],
    walk: ["Do you hear that? No? Me neither. I love that.", "I'm not afraid of the dark. We're just... carefully friends.", "This is nice. Just walking."] },
  steady: { label: "steady, slow and dry",
    first: ["Traveling alone? Hm. That's a long way without company. I could come along. Slowly."],
    ask: ["Hm. A visitor. I'll come along, but only for someone who can think a little. Try this."],
    join: ["You solved it? Hm. I suppose I could come along. Slowly."],
    walk: ["No rush. Rocks invented patience.", "I've sat in that spot for a very long time. Today is a very big day for me.", "Slow is still a speed."] },
  playful: { label: "playful and giggly",
    first: ["Wait, you're walking all by yourself? That's no fun at all! Can I come? Please? I promise only small splashes."],
    ask: ["Ooh, a new friend! Okay okay, I've got a good one for you. Ready?"],
    join: ["Ooh, you got it! Can I come? I promise to be only a little bit bouncy."],
    walk: ["Puddle ahead! ...I'm not going to jump in it. Probably.", "Water always finds a way. Usually the wiggly way.", "Race you! ...Slowly. Very slowly."] },
  dreamy: { label: "dreamy",
    first: ["You're walking on your own? The path is lovelier with someone beside you. Would you like a little light for the way?"],
    ask: ["Oh, hello. Before I follow you, would you look at something with me?"],
    join: ["You found it. Most people walk right past. I'd like to see where you go next."],
    walk: ["Stars are just lanterns that are very far away. I'm a very close one.", "Have you noticed the path looks different when you go slowly?", "Every leaf here is a little different. I checked."] },
  anxious: { label: "a bit nervous, very sweet",
    first: ["Are you... all on your own out here? Me too. Would you want me along? ...Okay. Okay! Yes. Let's not be lonely."],
    ask: ["Oh! Hi. I'd really like to come, but I get nervous... could you help me with this first?"],
    join: ["You'd really want me along? ...Okay. Okay! Yes."],
    walk: ["Is it alright if I hold onto your shoelace? Just for a bit.", "I was worried about today. I'm less worried now.", "I'm part of a group now. That's better, I think."] }
};
/* Kin -> personality. The Guide's five keep their own exact lines (below). */
SEED.voiceOf = {
  hush: "quiet", drowse: "quiet", whiffle: "quiet", nightcap: "quiet", muffin: "quiet", mallow: "quiet",
  pebblekin: "steady", sorrel: "steady", cobble: "steady", rootle: "steady", tock: "steady", ember: "steady",
  ripple: "playful", puddlekin: "playful", driftling: "playful", pipwhistle: "playful", hummel: "playful", fernwick: "playful",
  glimmer: "dreamy", lumen: "dreamy", kindle: "dreamy", sundew: "dreamy", sproutle: "dreamy", reedle: "dreamy",
  sockling: "anxious", knitlet: "anxious", thimble: "anxious", tangle: "anxious", bramble: "anxious", bobbin: "anxious"
};
SEED.kinLines = {
  hush: { join: ["Oh... you solved it. Would you like some company? I'm quiet, but I'm a very good listener."] },
  pebblekin: { first: ["Traveling alone? Hm. That's a long way without company. I suppose I could roll along. Slowly."], join: ["You solved it? Hm. I suppose I could roll along. Slowly."], walk: ["I've sat in that spot for three hundred years. Today is a very big day for me.", "No rush. Rocks invented patience."] },
  sockling: { first: ["You're traveling alone? Me too. You'd really want me along? Even with the little hole in my heel? ...Okay. Okay! Yes."],
    join: ["You'd really want me along? Even with the little hole in my heel? ...Okay. Okay! Yes."],
    walk: ["Is it alright if I hold onto your shoelace? Just for a bit.", "I used to be half of a pair. Now I'm part of a group. That's better, I think."] },
  ripple: { join: ["Ooh, you got it! Can I come? I promise only small splashes."], walk: ["Puddle ahead! ...I'm not going to jump in it. Probably.", "Water always finds a way. Usually the wiggly way."] },
  glimmer: { join: ["You found the light. Most people walk right past it. I'd like to see where you go next."], walk: ["Stars are just lanterns that are very far away. I'm a very close one.", "Have you noticed the path looks different when you go slowly?"] },
  puddlekin: { join: ["Ooh, you got it! Can I come? I promise only small splashes."] },
  driftling: { join: ["Ooh, you got it! Can I come? I promise only small splashes."] },
  lumen: { join: ["You found the light. Most people walk right past it. I'd like to see where you go next."] },
  cobble: { join: ["You solved it? Hm. I suppose I could scuttle along. Sideways. Slowly."], walk: ["Sideways is a perfectly good direction.", "No rush. Rocks invented patience."] },
  tock: { walk: ["Tick. Tock. ...I'm not counting anything. It's just a habit."] },
  ember: { walk: ["Anyone cold? No? I'll keep the warm ready anyway."] },
  nightcap: { walk: ["Is it bedtime yet? ...No? Alright. I'll just rest my eyes while I walk."] },
  drowse: { walk: ["Mm. Walking is a lot like napping, but with feet."] },
  knitlet: { walk: ["If I get tangled, you'll wait for me, right? ...Thank you."] },
  kindle: { join: ["You found the light. Most people walk right past it. I'd like to see where you go next."], walk: ["I'll keep my light low. Just enough to see your feet."] },
  pipwhistle: { walk: ["La la la... oh! Was that too loud? I'll hum it instead."] }
};
/* Said together near Seed Hill, before the planting. Roles fill from your friends. */
SEED.groupBanter = [
  { role: "steady", text: "Are we there yet?" },
  { role: "playful", text: "You said you invented patience!" },
  { role: "first", text: "I'm glad we didn't do this alone." }
];
SEED.calm = {
  wrong: "Hmm, not quite. That's okay. Want a hint?",
  wrongSoft: "Hmm, not quite. That's okay.",
  told: "The answer is {a}. That one's a tricky one.",
  joinedAnyway: "{name} beams at you anyway."
};
