/* Gremlin chess quips: EDIT FREELY. Short, kind, silly lines in each gremlin's voice.
   Triggers:
     start          the game begins
     gremlinTakes   the gremlin captures one of your pieces
     playerTakes    you capture one of the gremlin's pieces
     playerCheck    you put the gremlin's king in check
     gremlinCheck   the gremlin puts your king in check
     flustered      you're about to checkmate, or the gremlin is losing badly
     gremlinWins    the gremlin wins (shown on the end card)
     playerWins     you win (shown just before the surprise card)
     longThink      you've been thinking a while (no rush, ever)
     idle           you've wandered off for a bit
     surprise       the personal "you beat me" line on the surprise card
   House rules: kind, never taunting, family-safe, exclamation marks only now and then.
   The game picks a line at random and never repeats the last one. */
window.GremlinQuips = {
  noodle: {
    start: ["Ooh, chess. Is the horse one allowed to jump? It is? Amazing.", "I brought crackers. You can be the crackers. I'll be the crumbs.", "Okay. I'm ready. I think. Which way is forward?", "Let's play. I promise to only eat a few of the pieces."],
    gremlinTakes: ["Oops, snack.", "I took one. Was that allowed? It was? Hooray.", "Nom. Sorry. Nom.", "I'll keep this one safe in my pocket. With the crumbs."],
    playerTakes: ["Oh no, my snack.", "Hee, you got that one.", "That was my favourite. They're all my favourite.", "Bye, little piece. Have a nice nap."],
    playerCheck: ["Uh-oh... my king is looking at me funny.", "Is this the scary bit? This feels like the scary bit.", "Uh-oh. Hide, king, hide.", "My king says he'd like a cracker. And a plan."],
    gremlinCheck: ["Your king looks a bit worried. Sorry, king.", "I said check. I don't totally know why. But check.", "Check? Check. Want a cracker while you think?", "Oh, I think that's check. Tiny sorry."],
    flustered: ["Uh-oh, you got me. Probably.", "Wait, wait, I need a snack break.", "My pieces are all looking at me. I don't have answers.", "Um. Is there an undo for gremlins?"],
    gremlinWins: ["I won? I didn't even know I was trying. Good game.", "Wait, did I do that? Wow. Good game, you were very kind to my snacks.", "Ooh. A win. I'll share my crackers to celebrate.", "Good game. Let's play again, I'll probably forget how I did that."],
    playerWins: ["You got me. Fair and square and crunchy.", "Oh, that's checkmate. Wow. You're good at this.", "You won. I'm so happy for you I could eat a cracker.", "Hooray for you. Truly."],
    longThink: ["Take your time. I'm counting my crackers.", "Thinking is good. I'll just be here, chewing quietly.", "No rush. I've lost track of whose turn it is anyway.", "Hmm, hm-hmm. That's me humming while you think."],
    idle: ["Hello? Did you go get snacks? Bring me one.", "I'll keep your seat warm.", "Noodle is still here. Noodle is always here.", "I rearranged the crumbs while you were gone."],
    surprise: "You beat me. Okay, close your eyes. Now open them. It's a tiny paper crown I folded out of a cracker box. It's for you. Mostly."
  },
  pip: {
    start: ["Let's grow a big idea on this board.", "I have a plan. It's very bold. Don't look at it.", "Fresh board, fresh soil. Let's plant some moves.", "Ooh, I love the beginning. Anything could sprout."],
    gremlinTakes: ["Snip. Pruned that one.", "A daring leap.", "Sorry, that one was in my sunny spot.", "Weeded. Gently. With love."],
    playerTakes: ["Oh. I forgot to water that one.", "Hmm, that plan wilted.", "Fair. That seedling was wobbly.", "Clever. I'll write that in my idea jar."],
    playerCheck: ["Uh-oh... my king is in a draught.", "Oh, checky. I didn't see that sprouting.", "Uh-oh. Time to repot the king.", "Eep. Okay. New plan. Newer plan."],
    gremlinCheck: ["Check. Isn't that exciting?", "Check. Sorry, I got excited.", "My bold plan says check.", "Check. Your king is in my greenhouse now."],
    flustered: ["Uh-oh, you got me. My plan is all weeds.", "Okay, my garden is a bit trampled.", "I think my big idea needs a nap.", "Oh dear. I watered all the wrong pots."],
    gremlinWins: ["My wild plan worked. Good game. Want to try again?", "It sprouted. Good game, that was fun.", "We grew a whole game together. Good game.", "Ha, the bold plan bloomed. Your turn next time, I bet."],
    playerWins: ["You got me. That was the best idea on the board.", "Oh, beautiful. Your plan bloomed.", "That's checkmate. Wow, you're a gardener too.", "You won. I'm going to tell all the ferns."],
    longThink: ["Good ideas take a little sunshine.", "Take your time. Seeds don't rush.", "Ooh, I can see you growing a plan.", "Thinking face. I love a thinking face."],
    idle: ["I'll water the ferns while you're away.", "The board is waiting, all cosy.", "Back soon? I'll save you a seed.", "Still here. Still bouncy."],
    surprise: "You beat me. That was the best idea on the whole board. I saved you a seed from the greenhouse. Plant it somewhere sunny."
  },
  dot: {
    start: ["Let's keep everything nice and tidy.", "Mind the ink. Your move first, if you like.", "Every piece in its row. Lovely. Let's begin.", "The cat has agreed to watch quietly. Mostly."],
    gremlinTakes: ["That one was out of line.", "Tidied away.", "Filed neatly. Sorry.", "I'll put it on the shelf with the others."],
    playerTakes: ["Oh. I left a gap there.", "Smudged.", "That's a crooked line now. Well done.", "Hm. A misprint on my side."],
    playerCheck: ["Uh-oh... that's not lined up at all.", "Oh. Check. Let me straighten that.", "Uh-oh. My king needs a ruler.", "The cat just looked at me. That's never good."],
    gremlinCheck: ["Check. Neatly done, if I say so myself.", "Check. Lined up just so.", "Check, in a nice straight line.", "Check. Sorry. It was very tidy, though."],
    flustered: ["Uh-oh, you got me. Everything's crooked.", "Oh dear, the margins are a mess.", "I need to tidy. I need to tidy so much.", "The cat is hiding. I might join her."],
    gremlinWins: ["Good game. Everything ended up in its right place, I think.", "All lined up. Good game. Shall we set them up again?", "A tidy finish. Thank you for a lovely game.", "Good game. The cat approves of both of us."],
    playerWins: ["You got me, and it was beautifully lined up.", "That's checkmate. Very neat work.", "Oh. Oh, that's perfect. Well played.", "You won. The cat is clapping. Slowly."],
    longThink: ["Measure twice, move once.", "Take your time. Good lines take care.", "I'll just straighten these letters while you think.", "No rush. The ink needs to dry anyway."],
    idle: ["I tidied your captured pieces while you were away.", "The board is waiting, nice and straight.", "The cat is keeping your seat warm.", "Still here, still tidy."],
    surprise: "You beat me, fair and square, and everything lined up beautifully. The cat and I printed you a little certificate. The ink is still wet."
  },
  moth: {
    start: ["The light on this board is lovely tonight.", "Shall we paint a game together?", "I'll sit by the lamp. You sit by the moon.", "Every game starts as a blank page. Let's fill it softly."],
    gremlinTakes: ["That piece flew toward the light.", "A soft little swoop.", "Sorry. It looked so pretty there.", "I'll paint that one into my sketchbook."],
    playerTakes: ["Oh, I was looking at the lamp.", "A smudge in my painting.", "That was graceful. Like a moth at dusk.", "Mm. Lovely colour, that move."],
    playerCheck: ["Uh-oh... the light is on my king now.", "Oh. That's a shadow I didn't see.", "Uh-oh. My king is fluttering.", "Hm. I followed the wrong glow."],
    gremlinCheck: ["Check. The light is on your king.", "Check, softly.", "A little check, like a lantern turning on.", "Check. Don't worry, it's a gentle one."],
    flustered: ["Uh-oh, you got me. The lamp's going dim.", "My painting is all smudges now.", "I think I'm flying in circles.", "Oh dear, my wings are tangled."],
    gremlinWins: ["I won, but your moves had such nice colours. Good game.", "Good game. That was a pretty one.", "A quiet finish. I'll paint it later.", "Good game. Shall we start a new sketch?"],
    playerWins: ["You got me. Like a moth to a very clever flame.", "That's checkmate. It was beautiful.", "You won. The lanterns are all glowing for you.", "Oh, well painted."],
    longThink: ["Take your time. The moon isn't going anywhere.", "I like watching you think. It's like watching a sunrise.", "No hurry. I'm mixing colours.", "Drift as long as you like."],
    idle: ["I'll keep the lamp on for you.", "The board is resting in the lamplight.", "I painted a tiny you while you were gone.", "Still here, still dreaming."],
    surprise: "You beat me. That was a beautiful game, like a painting. I made you a tiny lantern doodle to remember it by."
  },
  vesper: {
    start: ["Welcome. Let's open a good book.", "Every game is a story. Shall we begin?", "Chapter one. Your move.", "I've cleared a space on the reading table."],
    gremlinTakes: ["Returned to the shelf.", "A small chapter ends.", "Overdue, I'm afraid.", "I'll keep that one safe between the pages."],
    playerTakes: ["Well read.", "Hm. I skipped a page.", "A fine plot twist.", "You found the footnote I hoped you'd miss."],
    playerCheck: ["Uh-oh... an unexpected chapter.", "Oh. I didn't read that coming.", "Uh-oh. Shh, king, shh.", "A cliffhanger. How rude. How lovely."],
    gremlinCheck: ["Check, gently.", "Check. Turn the page carefully.", "Check. A quiet one.", "Check. There's still plenty of story left."],
    flustered: ["Uh-oh, you got me. I've lost my place.", "Oh my. This isn't the ending I planned.", "I may need to reshelve my whole strategy.", "Quietly panicking. In a library voice."],
    gremlinWins: ["Good game. You turned some lovely pages.", "The end. But only of this volume. Good game.", "A good story, well told by both of us.", "Good game. Come back and we'll read another."],
    playerWins: ["You got me. I'll write that chapter down.", "That's checkmate. A perfect ending.", "You won. Beautifully written.", "Oh, well played. I'll shelve this one under favourites."],
    longThink: ["Take your time. Good books aren't rushed.", "Reading the board is half the fun.", "No hurry. I'll mark our page.", "Mm. A thoughtful reader."],
    idle: ["I'll keep your place with a bookmark.", "The story will wait for you.", "Still here, reading quietly.", "Take all the time you need. Libraries are patient."],
    surprise: "You beat me. I'll have to write that chapter down. I set a bookmark aside for you, pressed with a little fern."
  },
  grimble: {
    start: ["Come in, sit down. There's no hurry at this table.", "Take all the time you like. I'll put the kettle on.", "Ah, a game. Let's breathe first. In, and out.", "Shoulders down. Good. Now, your move."],
    gremlinTakes: ["Mm. That one's mine, I'm afraid.", "Ah. A careful trade.", "Sorry about that one. It'll rest in the burrow.", "A gentle take. Breathe, you're doing fine."],
    playerTakes: ["Oh, well played.", "Very good. I didn't see that.", "Ah. You've been practising.", "Lovely. Take a breath and enjoy that one."],
    playerCheck: ["Uh-oh... well, well.", "Ah. Check. Let me think a moment.", "Uh-oh. My old king is surprised.", "Good. Very good. Now I must be careful."],
    gremlinCheck: ["Check. Breathe. You have time.", "Check. No rush at all.", "A gentle check. Look around before you move.", "Check. There's always a way, if you look slowly."],
    flustered: ["Uh-oh, you got me. Or nearly.", "Oh my. I think you've found something.", "Hmm. My burrow is getting rather cramped.", "Well. I'll need my thinking cushion."],
    gremlinWins: ["Good game. You played thoughtfully.", "Good game. Shall we look at it again? There's always another.", "A fine game. Every one teaches us something.", "Good game. Tea, and then another?"],
    playerWins: ["Well, well. You got me.", "That's checkmate. Wonderful. Truly.", "You won. I'm very proud of you.", "Oh, splendid. I haven't been beaten in ages."],
    longThink: ["Take your time. Thinking is the best part.", "No rush. I'll sip my tea.", "Breathe. The board will wait.", "Good. Slow and careful."],
    idle: ["I'll keep the kettle warm for you.", "Still here. Still comfy.", "The burrow is quiet. Come back whenever you like.", "Rest is part of the game too."],
    surprise: "Well, well. You beat me. I haven't been beaten in ages, and it feels rather wonderful. I've tucked something away for you in the burrow."
  }
};
