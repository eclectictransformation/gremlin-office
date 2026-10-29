/* The Seed Path: words. One line per dialogue box. {n} = number of friends to find. */
window.SEED = window.SEED || {};
SEED.text = {
  numbers: ["no", "one", "two", "three", "four", "five"],
  arrive: [
    { who: "The Cloud", text: "Oh, hello. You came through the sock. Welcome to the Hollowmere." },
    { who: "The Cloud", text: "{N} shy friends are hiding. Go slowly. They like that." },
    { who: "The Cloud", text: "When they're all with you, we'll plant a seed on the hill. Tap me, or the cloud button, if you'd like a hint." }
  ],
  firstFriend: { who: "The Cloud", text: "Now you're not walking alone. The others might ask a little riddle or a tiny puzzle first. There's no wrong way to try." },
  askAgain: "Want to try my little puzzle again? It's still here.",
  nearlyThere: "Nearly! I can see the top from here!",
  welcomeBack: { who: "The Cloud", text: "Welcome back. Everything waited for you." },
  befriended: "{name} decides to come along with you.",
  journalNew: "A new page has filled in, in your journal.",
  allFound: { who: "The Cloud", text: "Everyone's here. The hedge in front of Seed Hill has woken up. North of the meadow." },
  hedgeSleeping: "The hedge is resting. It will wake when {n} friends walk with you. ({have} with you so far.)",
  hedgeAwake: "The hedge yawns and leans aside.",
  restingPath: "This path is resting today. Another walk, another time.",
  seedNotYet: "A soft bare patch of earth. It's waiting for all your friends.",
  stepAway: "That's alright. {name} will be right here whenever you'd like to try again.",
  fetchFound: "You found {item}.",
  fetchGive: "You give {name} {item}. It holds it close.",
  fetchDim: "Something glints faintly here... you could look closer.",
  stillPeek: ["...", "a tiny peek...", "almost..."],
  followWait: "slowly...",
  ending: [
    "Your friends gather in a circle around the bare patch.",
    "You press a seed gently into the earth."
  ],
  card: "You can always plant a seed.",
  farewell: "Your friends wave, and wander home, each in their own direction. They know where to find you.",
  rest: "Rest here as long as you like.",
  hints: {
    find: "{name} is waiting in {area}, {where}.",
    here: {
      breath: "{name} is nearby. Say hello, then breathe along with it.",
      still: "{name} is nearby. Stand close and press nothing for a little while.",
      rhythm: "{name} is nearby. Say hello, then tap along. Close is good enough.",
      follow: "{name} is nearby. Say hello, then follow slowly. If it stops, pause a moment.",
      fetch: "{name} is nearby and has lost something. Say hello first.",
      fetchLook: "{item} is somewhere in {area}. Look for a tiny glint near the edges.",
      fetchReturn: "You have {item}. Take it back to {name}.",
      hum: "{name} is nearby. Say hello, then hum along.",
      untangle: "{name} is nearby, all in knots. Say hello.",
      sort: "{name} is nearby with a mixed-up pile of pebbles.",
      mirror: "{name} is nearby, stretching. Say hello and join in.",
      count: "{name} is nearby. Say hello, then light each one as it appears.",
      warm: "{name} is nearby, by a little fire. Say hello.",
      guide: "{name} is nearby with a thirsty seed. Say hello."
    },
    first: "{name} is nearby, and might like some company. Say hello.",
    puzzle: "{name} is nearby, with a little riddle or puzzle for you. Say hello. Inside, hints appear after a couple of tries.",
    hill: "All your friends are with you. Seed Hill is north of the meadow; the bare patch is at the very top.",
    hillHere: "Walk up to the bare patch at the top of the hill and plant the seed."
  },
  restBench: ["You sit. The bench is warm.", "Three slow breaths, if you like. In through the nose... and a longer breath out."]
};
