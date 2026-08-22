#!/usr/bin/env python3
"""
keymap.py — the single source of truth for how gamedata item keys map onto the
outside world, shared by scrape_prices.py, sync_prices.py and sync_alch.py.

There are TWO slug namespaces and they are not the same:

  * markets.lostcity.rs slugs — what scrape_prices.py fetches. `SLUG` maps a
    gamedata key to one of these.
  * LostCityRS/Content slugs — what LC-bankvalue's items.json is keyed by.
    These are the authoritative item ids the .sav format uses.

Most keys are identical in both. Where they differ, the market site is the odd
one out (`bolt` is `bronze_bolts` there, `3dose1attack` is `attack_potion_3_`),
so Content resolution tries the identity slug FIRST and only falls back to
`SLUG`. Verified: no gamedata key resolves to two different Content items under
that order.
"""

# ---------------------------------------------------------------------
# Market-site slugs. Only entries where the gamedata key differs.
# ---------------------------------------------------------------------
SLUG = {
    "dragonhide_green":  "dragonhide_green",
    "dragonhide_blue":   "dragonhide_blue",
    "dragonhide_red":    "dragonhide_red",
    "cow_hide":          "cow_hide",
    "jug_wine":          "jug_of_wine",
    "rune_2h":           "rune_2h_sword",
    # NOTE: magic_staff is NOT staff_of_air. Content has them as separate items
    # — magic_staff is id 1389 "Magic staff" (cost 200, alch 120), staff_of_air
    # is id 1381 (cost 1500, alch 900). Mapping one to the other put 900 in
    # alch.json for a 120gp item. The identity slug is correct; no entry needed.
    "battlestaff_water": "water_battlestaff",
    "battlestaff_earth": "earth_battlestaff",
    "battlestaff_air":   "air_battlestaff",
    "goblin_armour":     "goblin_mail",
    "bluewizhat":        "blue_wizard_hat",
    "wizards_robe":      "blue_wizard_robe",
    "bolt":              "bronze_bolts",
    "keyhalf1":          "keyhalf1",
    "keyhalf2":          "keyhalf2",
    "loop_half_key":     "keyhalf2",
    "tooth_half_key":    "keyhalf1",
    "left_shield_half":  "shield_left_half",
    "vial_water":        "vial_water",
    # Identified herbs — site slugs
    "herb_guam":         "guam_leaf",
    "herb_marrentill":   "marentill",
    "herb_tarromin":     "tarromin",
    "herb_harralander":  "harralander",
    "herb_ranarr":       "ranarr_weed",
    "herb_irit":         "irit_leaf",
    "herb_avantoe":      "avantoe",
    "herb_kwuarm":       "kwuarm",
    "herb_cadantine":    "cadantine",
    "herb_lantadyme":    "lantadyme",
    "herb_dwarf_weed":   "dwarf_weed",
    "3dose1defense":     "defence_potion_3_",
    "3dose1strength":    "strength_potion_3_",
    "3dose1attack":      "attack_potion_3_",
    # Potions — site uses "3dose<variant><stat>" slugs (variant 2 = super).
    # All scraped at 3-dose then scaled ×4/3 to 4-dose for the trip model.
    # Supers use a per-unit cap (see BUNDLE_CAPS) to reject super-SET listings
    # that pollute the same slug. Restore = normal stat-restore (DBA spec).
    "super_attack":      "3dose2attack",
    "super_strength":    "3dose2strength",
    "super_defence":     "3dose2defense",
    "restore_potion":    "3dosestatrestore",
    "prayer_potion":     "3doseprayerrestore",
    "ranging_potion":    "3doserangerspotion",
    "magic_potion":      "3dose1magic",
    # Antifire potion — site slug is "3dose1antidragon" (the "anti-dragon
    # potion" listing), NOT "antifirepotion".
    "antifire_potion":   "3dose1antidragon",
    # Super antipoison — site slug "3dose2antipoison" (variant 2 = super).
    "super_antipoison":  "3dose2antipoison",
}

# Content slugs that differ from the gamedata key. Lost City's own pack
# misspells the adamant warhammer.
CONTENT_ALIASES = {
    "adamant_warhammer": "adamnt_warhammer",
}

# `super_set` is the sum of the three supers, derived after the fact rather
# than resolved against an item id.
#
# The two herb keys are gone: the 'unid' pref they fed was removed on
# 2026-08-21, since their blended "unidentified herb" value was a number
# nothing upstream could refresh. Herbs are now valued at identified prices.
DERIVED_KEYS = {"super_set"}

# ---------------------------------------------------------------------
# Potions: the sim's trip model counts 4-dose vials, but 2004scape tops out at
# 3 doses — only 3dose/2dose/1dose items exist. Scraped 3-dose prices are
# scaled up to the sim's 4-dose convention.
# ---------------------------------------------------------------------
POTION_3DOSE_KEYS = {
    "super_attack", "super_strength", "super_defence",
    "restore_potion", "prayer_potion", "ranging_potion", "magic_potion",
    "antifire_potion",
    "super_antipoison",
}
DOSE_3_TO_4 = 4 / 3

# ---------------------------------------------------------------------
# EXCLUDE — items NOT scraped (fixed price / skip / bury / alch default).
# Mirrors the default loot actions in gamedata.js. Don't waste requests.
# ---------------------------------------------------------------------
# Low/all-tier melee gear (bronze→adamant) is alch/skip-only — never worth a
# market request. (Their captured prices live in prices.json.) Rune weapons are
# excluded via RUNE_ALCH below; rune armour IS scraped (listed in DEFAULT_ITEMS).
TIER_PREFIXES = ("bronze_", "iron_", "black_", "steel_", "mithril_", "adamant_")
EQUIP_SUFFIXES = (
    "_dagger", "_sword", "_longsword", "_scimitar", "_2h_sword", "_battleaxe",
    "_axe", "_mace", "_warhammer", "_hammer", "_spear", "_halberd", "_claws",
    "_hatchet", "_pickaxe", "_full_helm", "_med_helm", "_helm", "_platebody",
    "_platelegs", "_plateskirt", "_chainbody", "_chainmail", "_sq_shield",
    "_square_shield", "_kiteshield", "_boots", "_gauntlets", "_gloves",
)
RUNE_ALCH = {
    "rune_dagger", "rune_warhammer", "rune_mace", "rune_spear",
    "rune_battleaxe", "rune_longsword", "rune_sword",
}
# Shop-stocked staves — the general store sells them endlessly, so a listing is
# a hope, not a bid. Mirrors UNSELLABLE_STAVES in gamedata.js.
# The elemental BATTLEstaves are deliberately absent — those trade properly
# (~25k). This is only the basic shop-stocked staves.
UNSELLABLE_STAVES = {
    "magic_staff", "staff", "plainstaff",
    "staff_of_air", "staff_of_water", "staff_of_earth", "staff_of_fire",
}

EXCLUDE_EXPLICIT = {
    "jug_wine", "spinach_roll", "knife", "ashes", "pineapple", "thread",
    "plainstaff", "staff", "bones", "big_bones", "jogre_bones", "ogre_bones",
    "tin_ore", "copper_ore", "tinderbox", "fishing_bait", "goblin_armour",
    "vial_empty", "druidrobetop", "druidrobebottom", "black_robe", "bluewizhat",
    "chefs_hat", "grain", "fur", "raw_bear_meat", "eye_patch", "bronze_bar",
    "wizards_robe", "raw_beef", "raw_chicken", "brass_necklace", "beer",
    "magic_staff", "bass", "tuna",
    "staff_of_earth", "staff_of_fire", "staff_of_air", "staff_of_water",
    "rune_javelin", "mind_talisman", "earth_talisman", "air_talisman",
    "fire_talisman", "body_talisman", "cosmic_talisman",
    "black_cape", "red_cape", "blue_cape", "yellow_cape", "green_cape",
    "purple_cape", "orange_cape", "pink_cape", "white_cape",
    "bronze_javelin", "iron_javelin", "black_javelin", "steel_javelin",
    "mithril_javelin", "adamant_javelin", "bolt", "bronze_bolts",
    # fishing-themed dagannoth junk — skip-by-default, not worth a request
    "lobster_pot", "raw_herring", "raw_sardine", "harpoon", "raw_tuna",
    "raw_lobster", "bigoysterpearls", "smalloysterpearls", "opal_bolttips",
    "seaweed",
    # casket — value is computed as the EV of its contents (gems + coins +
    # rare half-keys) in gamedata.js, not scraped directly.
    "casket",
}


def is_tier_equipment(key):
    return key.startswith(TIER_PREFIXES) and key.endswith(EQUIP_SUFFIXES)


def is_bulk_unsellable(key):
    """Has a market listing but can't be sold in stacks — only the alch value
    is real. Mirrors isBulkUnsellable() in gamedata.js, which zeroes the sale
    value for these and prices them at alch minus the nature rune."""
    return (is_tier_equipment(key)
            or key in RUNE_ALCH
            or key in UNSELLABLE_STAVES)


def is_excluded(key):
    if key in EXCLUDE_EXPLICIT or key in RUNE_ALCH:
        return True
    return is_tier_equipment(key)


def to_slug(key):
    """gamedata key -> markets.lostcity.rs slug."""
    return SLUG.get(key, key)


def to_content_slug(key, known_slugs):
    """gamedata key -> LostCityRS/Content slug, or None.

    Identity first: where the two namespaces disagree it's the market site that
    renamed things, and `known_slugs` is Content's own list.
    """
    if key in DERIVED_KEYS:
        return None
    alias = CONTENT_ALIASES.get(key)
    if alias:
        return alias if alias in known_slugs else None
    if key in known_slugs:
        return key
    mapped = SLUG.get(key)
    if mapped and mapped in known_slugs:
        return mapped
    return None
