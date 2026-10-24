#!/usr/bin/env python3
"""Build app/src/main/assets/data.js from RuneScape Wiki Treasure Trails guide pages.

Usage: python3 tools/build_data.py <dir-with-downloaded-html> <output data.js>
The HTML files are the `action=parse` output of the Treasure_Trails/Guide/* pages
(see tools/fetch_wiki.sh). Data: RuneScape Wiki, CC BY-NC-SA 3.0.
"""
import json, re, sys, os, glob
from bs4 import BeautifulSoup

SRC, OUT = sys.argv[1], sys.argv[2]
WIKI = "https://runescape.wiki"


def clean(cell):
    if cell is None:
        return ""
    cell = BeautifulSoup(str(cell), "lxml")
    for sup in cell.find_all("sup", class_="reference"):
        sup.decompose()
    for sr in cell.find_all("span", class_="skillreq"):
        sr.replace_with(f"{sr.get('data-level')} {sr.get('data-skill')}")
    for im in cell.find_all("img"):
        if (im.get("src") or "").split("?")[0].endswith("-icon.png"):
            im.replace_with(" " + im.get("alt", ""))
    for br in cell.find_all("br"):
        br.replace_with("\n")
    for li in cell.find_all("li"):
        li.insert_before("\n• ")
    t = cell.get_text(" ")
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r" ?\n ?", "\n", t)
    t = re.sub(r"\n+", "\n", t)
    t = re.sub(r" ([.,;:!?)])", r"\1", t)
    t = re.sub(r"\( ", "(", t)
    t = re.sub(r"\[ ?(edit|\d+) ?\]", "", t)
    return t.strip()


def img(cell):
    if cell is None:
        return None
    i = cell.find("img")
    if not i or not i.get("src"):
        return None
    src = i["src"].split("?")[0]
    return WIKI + src if src.startswith("/") else src


def soup(name):
    return BeautifulSoup(open(os.path.join(SRC, name + ".html")).read(), "lxml")


def tables(s, cls):
    return [t for t in s.find_all("table") if cls in " ".join(t.get("class") or [])]


def difficulty(t):
    h = t.find_previous(["h2", "h3"])
    h = h.get_text(" ", strip=True).lower() if h else ""
    for d in ["easy", "medium", "hard", "elite", "master"]:
        if d in h:
            return d
    return ""


def rows(t):
    return [r for r in t.find_all("tr") if r.find_parent("table") is t]


def extras(t):
    """Secondary header/value row pairs below a clue's main row (challenge, requirements...)."""
    rs = rows(t)[2:]
    out = {}
    for h, v in zip(rs[0::2], rs[1::2]):
        for hc, vc in zip(h.find_all("th", recursive=False), v.find_all("td", recursive=False)):
            val = clean(vc)
            if val and val.lower() != "none":
                out[clean(hc)] = val
    return out


def simple_table(t):
    """Header row + data rows -> list of dicts (header -> cell)."""
    rs = rows(t)
    hdr = [clean(c) for c in rs[0].find_all(["th", "td"], recursive=False)]
    out = []
    for r in rs[1:]:
        cs = r.find_all(["td", "th"], recursive=False)
        if len(cs) < 2:
            continue
        out.append({hdr[i]: cs[i] for i in range(min(len(hdr), len(cs)))})
    return out


data = {}

# --- Anagrams ---------------------------------------------------------------
an = []
for t in tables(soup("Anagrams"), "cluetable-anagram"):
    for r in simple_table(t)[:1]:
        clue = clean(r["Anagram"])
        m = re.search(r":\s*(.+)$", clue)
        an.append({
            "d": difficulty(t),
            "clue": m.group(1).strip() if m else clue,
            "full": clue,
            "npc": clean(r.get("Solution")),
            "loc": clean(r.get("Location")),
            "travel": clean(r.get("Suggested travel")),
            "img": img(r.get("Image")),
            "x": extras(t),
        })
data["anagrams"] = an

# --- Cryptics + simple clues ---------------------------------------------------
cr = []
for page in ["Cryptics", "Simple_clues"]:
    for t in tables(soup(page), "cluetable-cryptic"):
        for r in simple_table(t)[:1]:
            clue = clean(r["Cryptic"])
            # The wiki repeats the full scroll text in brackets on a second line.
            m = re.match(r"(.+?)\n\((.+)\)$", clue, re.S)
            if m:
                clue = m.group(2) if m.group(1).rstrip(".") in m.group(2) else m.group(1) + " " + m.group(2)
            cr.append({
                "d": difficulty(t),
                "clue": clue,
                "sol": clean(r.get("Solution")),
                "loc": clean(r.get("Location")),
                "travel": clean(r.get("Suggested travel")),
                "img": img(r.get("Image")),
                "simple": page == "Simple_clues",
                "x": extras(t),
            })
data["cryptics"] = cr

# --- Emotes ----------------------------------------------------------------------
em = []
for t in tables(soup("Emotes"), "cluetable-emote"):
    rs = rows(t)
    e = {"d": difficulty(t)}
    hdr = None
    for r in rs:
        cs = r.find_all(["th", "td"], recursive=False)
        if cs and all(c.name == "th" for c in cs):
            hdr = [clean(c) for c in cs]
            continue
        if not hdr:
            continue
        for h, c in zip(hdr, cs):
            if h == "Clue":
                if "clue" in e:
                    em.append(e)
                    e = {"d": difficulty(t)}
                e["clue"] = clean(c)
            elif h == "Requirements":
                e["req"] = clean(c)
            elif h == "Hidey-hole":
                e["hole"] = clean(c)
            elif h == "Fight?":
                e["fight"] = clean(c)
            elif h == "Items":
                e["items"] = [clean(li) for li in c.find_all("li")] or [x for x in clean(c).split("\n") if x]
            elif h == "Suggested travel":
                e["travel"] = clean(c)
            elif h == "Emote":
                e["emote"] = clean(c)
            elif h == "Image":
                e["img"] = img(c)
    if "clue" in e:
        em.append(e)
data["emotes"] = em

def extras_coord(rs):
    out = {}
    rs = rs[3:]
    for h, v in zip(rs[0::2], rs[1::2]):
        for hc, vc in zip(h.find_all("th", recursive=False), v.find_all("td", recursive=False)):
            val = clean(vc)
            if val and val.lower() != "none":
                out[clean(hc)] = val
    return out


# --- Coordinates -----------------------------------------------------------------
co = []
for t in tables(soup("Coordinates"), "cluetable-coord"):
    rs = rows(t)
    for r in rs[1:]:
        cs = r.find_all(["td"], recursive=False)
        if len(cs) < 3:
            continue
        txt = clean(cs[0])
        m = re.search(r"(\d+) degrees (\d+) minutes (north|south), (\d+) degrees (\d+) minutes (east|west)", txt)
        if not m:
            continue
        co.append({
            "d": difficulty(t),
            "clue": m.group(0),
            "c": [int(m.group(1)), int(m.group(2)), m.group(3)[0].upper(), int(m.group(4)), int(m.group(5)), m.group(6)[0].upper()],
            "loc": clean(cs[1]),
            "travel": clean(cs[2]),
            "img": img(cs[3]) if len(cs) > 3 else None,
            "x": {k: v for k, v in extras_coord(rs).items()},
        })
data["coords"] = co

# --- Maps --------------------------------------------------------------------------
mp = []
for t in tables(soup("Maps"), "wikitable"):
    for r in simple_table(t):
        if "Map Clue" not in r:
            continue
        mp.append({
            "d": difficulty(t),
            "map": img(r.get("Map Clue")),
            "sol": clean(r.get("Solution")),
            "travel": clean(r.get("Suggested travel")),
            "img": img(r.get("Image")),
        })
data["maps"] = mp

# --- Challenge scrolls ---------------------------------------------------------------
ch = []
for t in tables(soup("Challenge_scrolls"), "wikitable"):
    for r in simple_table(t):
        ch.append({"d": difficulty(t), "npc": clean(r.get("Asked by")), "q": clean(r.get("Question")), "a": clean(r.get("Answer"))})
data["challenges"] = ch

sk = []
for t in tables(soup("Skill_riddle_challenges"), "wikitable"):
    for r in simple_table(t):
        if "Riddle" in r:
            sk.append({"q": clean(r["Riddle"]), "a": clean(r.get("Solution")), "req": clean(r.get("Requirements"))})
data["riddles"] = sk

# --- Scans -----------------------------------------------------------------------------
sc = []
idx = json.load(open(os.path.join(SRC, "scans", "index.json")))
for title, wording, diff in idx:
    s = BeautifulSoup(open(os.path.join(SRC, "scans", title.replace(" ", "_").replace("/", "_") + ".html")).read(), "lxml")
    txt = s.get_text(" ", strip=True)
    m = re.search(r"scan range:?\s*(\d+)\s*paces", txt, re.I)
    spots = []
    for t in tables(s, "wikitable"):
        for r in simple_table(t):
            if "Possible locations" in r:
                spots.append({"t": clean(r["Possible locations"]), "img": img(r.get("Image"))})
    sc.append({"region": title.split(" - ", 1)[1], "wording": wording, "d": diff.lower(), "range": int(m.group(1)) if m else None, "spots": spots})
data["scans"] = sc

with open(OUT, "w") as f:
    f.write("// Generated by tools/build_data.py from the RuneScape Wiki (runescape.wiki), CC BY-NC-SA 3.0.\n")
    f.write("window.CLUE_DATA = ")
    json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    f.write(";\n")
for k, v in data.items():
    print(k, len(v))
