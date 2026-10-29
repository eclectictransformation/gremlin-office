/* The Gremlin Wardrobe: EDIT FREELY (but keep ids in step with the server allowlist).
   Every wearable and every accessory colour has an id. "free" things anyone can wear. Things with an "unlock"
   are earned (beat:<gremlin> or beat-all) and are only granted by the server from recorded wins.
   Things with neither are LOCKED PLACEHOLDERS: shown as a soft silhouette, "found somewhere in Gremlin World".
   IMPORTANT: the server keeps its own copy of this list (gw.wardrobe_items + gw.unlock_rules in
   supabase/migrations/20261029060000_gw_chess_social.sql). Add or rename an id here, and add it there too.
   No uploads, no free text: only these ids can ever be saved. */
window.GremlinWardrobe = {
  hint: "found somewhere in Gremlin World",
  slots: [
    { id: "hat", label: "Hat", items: [
      { id: "hat-none", label: "No hat", free: true },
      { id: "hat-beanie", label: "Cosy beanie", free: true },
      { id: "hat-acorn", label: "Acorn cap" },
      { id: "hat-crown", label: "Tiny paper crown" } ] },
    { id: "hat-color", label: "Hat colour", colorOf: "hat", items: [
      { id: "hat-color-moss", label: "Moss", color: "#54664A", free: true },
      { id: "hat-color-butter", label: "Butter", color: "#f3d98b", free: true },
      { id: "hat-color-ink", label: "Printer's ink", color: "#2d3a5a", unlock: "beat:dot" },
      { id: "hat-color-plum", label: "Plum", color: "#6b4f6e" } ] },
    { id: "scarf", label: "Scarf", items: [
      { id: "scarf-none", label: "No scarf", free: true },
      { id: "scarf-short", label: "Short scarf", free: true },
      { id: "scarf-long", label: "Very long scarf" } ] },
    { id: "scarf-color", label: "Scarf colour", colorOf: "scarf", items: [
      { id: "scarf-color-cream", label: "Cream", color: "#F1EDE2", free: true },
      { id: "scarf-color-sage", label: "Sage", color: "#A6B89A", free: true },
      { id: "scarf-color-leaf", label: "Greenhouse leaf", color: "#6fae4f", unlock: "beat:pip" },
      { id: "scarf-color-lantern", label: "Lantern glow", color: "#e9a548", unlock: "beat:moth" },
      { id: "scarf-color-gold", label: "Burrow gold", color: "#d4a62a", unlock: "beat:grimble" },
      { id: "scarf-color-plum", label: "Plum", color: "#6b4f6e" } ] },
    { id: "socks", label: "Socks", items: [
      { id: "socks-none", label: "Bare feet", free: true },
      { id: "socks-ankle", label: "Ankle socks", free: true },
      { id: "socks-tall", label: "Tall socks" } ] },
    { id: "sock-color", label: "Sock colour", colorOf: "socks", items: [
      { id: "sock-color-cream", label: "Cream", color: "#F1EDE2", free: true },
      { id: "sock-color-sage", label: "Sage", color: "#A6B89A", free: true },
      { id: "sock-color-stripy", label: "Noodle stripes", color: "#e46f5a", stripes: "#fff3d6", unlock: "beat:noodle" },
      { id: "sock-color-bookmark", label: "Bookmark blue", color: "#4f78a8", unlock: "beat:vesper" },
      { id: "sock-color-rainbow", label: "All-six rainbow", color: "#e46f5a", rainbow: true, unlock: "beat-all" },
      { id: "sock-color-moon", label: "Moonlight", color: "#c9c6e8" } ] },
    { id: "glasses", label: "Glasses", items: [
      { id: "glasses-none", label: "No glasses", free: true },
      { id: "glasses-round", label: "Round reading glasses" } ] }
  ],
  // how each unlock is described once you have it (the hint stays vague while it's locked)
  unlockNames: { "beat:noodle": "Beat Noodle at chess", "beat:pip": "Beat Pip at chess", "beat:dot": "Beat Dot at chess", "beat:moth": "Beat Moth at chess",
    "beat:vesper": "Beat Vesper at chess", "beat:grimble": "Beat Grimble at chess", "beat-all": "Beat all six gremlins at chess" }
};
