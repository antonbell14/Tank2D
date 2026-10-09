import base64, hashlib, heapq, json, math, random, socket, threading, time, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

HOST, PORT = "0.0.0.0", 3000
ROOT = Path(__file__).parent / "public"
R, BULLET_SPEED = 17, 420

# ---------------------------------------------------------------------------
# Classes de chars
# ---------------------------------------------------------------------------
TANK_CLASSES = {
    "light":  {"name":"Léger",  "hp":2, "speed":1.35, "turn":1.25, "reload":0.60, "bullet":1.00, "damage":1, "bounces":2, "radius":15},
    "heavy":  {"name":"Lourd",  "hp":5, "speed":0.72, "turn":0.80, "reload":1.30, "bullet":0.90, "damage":1, "bounces":2, "radius":20},
    "sniper": {"name":"Sniper", "hp":3, "speed":0.92, "turn":0.95, "reload":1.95, "bullet":1.75, "damage":2, "bounces":3, "radius":17},
}
DEFAULT_CLASS = "light"
def class_spec(cls): return TANK_CLASSES.get(cls) or TANK_CLASSES[DEFAULT_CLASS]

# ---------------------------------------------------------------------------
# Cartes
# ---------------------------------------------------------------------------
THEMES = {
    "carton":   {"floor":"#172119","grid":"#ffffff0b","wall":"#7b5b3c","edge":"#a9855e","style":"carton"},
    "metal":    {"floor":"#151a1f","grid":"#ffffff0a","wall":"#4a5260","edge":"#8a94a3","style":"metal"},
    "concrete": {"floor":"#1a1c1a","grid":"#ffffff08","wall":"#5d605a","edge":"#8f938b","style":"concrete"},
    "sand":     {"floor":"#272116","grid":"#ffffff07","wall":"#86663e","edge":"#c39a5f","style":"stone"},
    "forest":   {"floor":"#13241a","grid":"#ffffff06","wall":"#2e5a36","edge":"#5d9a63","style":"tree"},
    "ice":      {"floor":"#15283a","grid":"#ffffff0c","wall":"#9fcbe6","edge":"#e6f6ff","style":"ice"},
    "city":     {"floor":"#1c1d21","grid":"#ffffff07","wall":"#6e4b3a","edge":"#a5735a","style":"brick"},
}
CRATE_HP = 3

def sym(w, h, rects, centers=()):
    """Construit une carte à symétrie centrale : chaque équipe a exactement le même terrain."""
    walls = []
    for r in rects:
        x, y, rw, rh = r[:4]; kind = r[4] if len(r) > 4 else "wall"
        walls.append((x, y, rw, rh, kind)); walls.append((w - x - rw, h - y - rh, rw, rh, kind))
    for r in centers:
        x, y, rw, rh = r[:4]; kind = r[4] if len(r) > 4 else "wall"
        walls.append((x, y, rw, rh, kind))
    return walls

MAPS = {
    "carton": {"name":"Carton classique","w":960,"h":560,"theme":"carton",
        "walls":sym(960,560,[(210,95,26,220),(395,90,170,30),(280,370,40,40,"crate")],[(430,230,100,100)])},
    "compact": {"name":"Boîte compacte","w":760,"h":480,"theme":"carton",
        "walls":sym(760,480,[(165,70,28,250),(330,86,40,40,"crate")],[(300,205,160,70)])},
    "factory": {"name":"Usine croisée","w":1100,"h":620,"theme":"metal",
        "walls":sym(1100,620,[(245,80,30,270),(430,120,240,32),(360,260,40,40,"crate"),(250,420,40,40,"crate"),(290,420,40,40,"crate")],[(520,245,60,130)])},
    "corridors": {"name":"Couloirs","w":900,"h":700,"theme":"concrete",
        "walls":sym(900,700,[(190,80,28,430),(335,145,230,28),(218,330,90,26),(620,56,40,40,"crate")],[(390,285,120,130)])},
    "arena": {"name":"Grande arène","w":1280,"h":720,"theme":"sand",
        "walls":sym(1280,720,[(270,90,32,330),(480,125,320,34),(370,300,90,34),(400,440,40,40,"crate"),(180,560,40,40,"crate")],[(565,260,150,200)])},
    "bunkers": {"name":"Bunkers","w":1040,"h":640,"theme":"concrete",
        "walls":sym(1040,640,[(300,140,140,26),(300,166,26,90),(300,474,140,26),(300,384,26,90),(190,300,40,40),(190,120,40,40,"crate")],[(496,296,48,48,"crate")])},
    "forest": {"name":"Forêt","w":1120,"h":660,"theme":"forest",
        "walls":sym(1120,660,[(210,110,40,40),(350,190,40,40),(230,320,44,44),(440,80,40,40),(330,450,44,44),(210,540,40,40),(470,530,40,40),(480,250,40,40),(380,330,36,36,"crate"),(320,70,36,36,"crate")])},
    "ice": {"name":"Banquise (glissante)","w":1000,"h":600,"theme":"ice","ice":True,
        "walls":sym(1000,600,[(230,110,30,160),(400,80,60,60),(300,350,100,30),(220,460,40,40,"crate")],[(480,280,40,40,"crate")])},
    "city": {"name":"Ville en ruines","w":1200,"h":680,"theme":"city",
        "walls":sym(1200,680,[(180,70,130,110),(180,290,110,100),(410,70,120,100),(400,270,70,70),(330,480,40,40,"crate"),(370,480,40,40,"crate")],[(560,280,80,120)])},
    "random": {"name":"Aléatoire (change à chaque manche)","w":1120,"h":640,"theme":"carton","random":True,"walls":[]},
}

def rect_gap(a, b):
    dx = max(0, a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]))
    dy = max(0, a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]))
    return math.hypot(dx, dy)

def generate_random_walls(w, h, rng=random):
    """Carte aléatoire symétrique. Un écart minimal entre obstacles garantit qu'aucune zone n'est fermée."""
    gap = 92
    for _ in range(80):
        walls = []
        if rng.random() < 0.7:
            cw, ch = rng.choice(((60, 140), (140, 60), (90, 90), (48, 48)))
            walls.append(((w - cw) // 2, (h - ch) // 2, cw, ch, rng.choice(("wall", "wall", "crate")) if cw == ch == 48 else "wall"))
        target = rng.randint(5, 8); tries = 0
        while len(walls) < target * 2 and tries < 500:
            tries += 1; roll = rng.random()
            if roll < 0.3: kind = "crate"; rw = rh = rng.choice((36, 40, 44))
            elif roll < 0.65: kind = "wall"; rw = rng.randint(24, 34); rh = rng.randint(90, 230)
            else: kind = "wall"; rw = rng.randint(90, 230); rh = rng.randint(24, 34)
            x = rng.randint(165, max(166, w - 165 - rw)); y = rng.randint(gap, max(gap + 1, h - gap - rh))
            a = (x, y, rw, rh, kind); b = (w - x - rw, h - y - rh, rw, rh, kind)
            if rect_gap(a, b) < gap: continue
            if any(rect_gap(a, o) < gap or rect_gap(b, o) < gap for o in walls): continue
            walls += [a, b]
        if len(walls) >= 8: return walls
    return sym(w, h, [(250, 120, 30, 200)], [((w - 90) // 2, (h - 90) // 2, 90, 90)])

W, H, WALLS, CURRENT_MAP, MAP_INFO, MAP_VERSION = 960, 560, [], "carton", {}, 0
_wall_seq = 0
def make_wall(x, y, w, h, kind="wall"):
    global _wall_seq
    _wall_seq += 1
    data = {"id": _wall_seq, "x": x, "y": y, "w": w, "h": h, "kind": kind}
    if kind == "crate": data["hp"] = data["maxHp"] = CRATE_HP
    return data

def apply_map(map_id):
    """(Re)charge la carte : les caisses détruites réapparaissent et la carte aléatoire est regénérée."""
    global W, H, WALLS, CURRENT_MAP, MAP_INFO, MAP_VERSION
    if map_id not in MAPS: map_id = "carton"
    data = MAPS[map_id]; CURRENT_MAP = map_id; W = data["w"]; H = data["h"]; MAP_VERSION += 1
    info = {"theme": data["theme"], "ice": data.get("ice", False), "random": data.get("random", False)}
    raw = data["walls"]
    if info["random"]:
        raw = generate_random_walls(W, H)
        info["theme"] = random.choice(["carton", "metal", "concrete", "sand", "forest", "city"])
    MAP_INFO = info
    WALLS = [make_wall(*r) for r in raw]
apply_map(CURRENT_MAP)

def public_map():
    data = MAPS[CURRENT_MAP]
    return {"id": CURRENT_MAP, "name": data["name"], "w": W, "h": H, "walls": WALLS, "version": MAP_VERSION,
            "theme": THEMES[MAP_INFO["theme"]], "ice": MAP_INFO["ice"], "random": MAP_INFO["random"]}

def map_catalog():
    return [{"id": k, "name": v["name"], "w": v["w"], "h": v["h"]} for k, v in MAPS.items()]

# ---------------------------------------------------------------------------
# Modes de jeu et bonus
# ---------------------------------------------------------------------------
GAME_MODE = "teams"            # "teams" (jaune contre bleu) ou "br" (battle royale, chacun pour soi)
BR_WINS_NEEDED = 3             # victoires nécessaires pour gagner une partie de battle royale
TEAM_WINS_NEEDED = 5
BR_COLORS = ["#ffd24d","#75d8ff","#f87171","#a3e635","#c084fc","#fb923c","#f472b6","#2dd4bf","#e5e7eb","#fde047","#60a5fa","#34d399","#fca5a5","#d8b4fe","#fdba74","#5eead4"]
POWER_TYPES = ["speed","shield","rapid","homing","rocket","spread","bouncy","mine"]
MAX_POWERUPS = 3
FIGHTER_TEAMS = ("yellow","blue","player")   # "player" = participant de battle royale (pas d'équipe)
KILL_SEQ = 0                   # compteurs globaux : ne repartent jamais à zéro
FX_SEQ = 0
PICKUP_SEQ = 0
MINE_SEQ = 0
MINES = []                     # hors de "state" : chaque joueur ne reçoit que les mines qu'il a le droit de voir

lock, clients, next_id = threading.RLock(), {}, 1

def new_state(**overrides):
    data = {"map":public_map(),"mode":"lobby","phase":"lobby","gameMode":GAME_MODE,"tanks":[],"bullets":[],"score":[0,0],"running":False,"winner":"",
            "roundDelay":0,"prepTimer":0,"powerups":[],"powerTimer":3,"returnTimer":0,"killEvents":[],"killSeq":KILL_SEQ,"explosions":[],"pickups":[],"zone":None}
    data.update(overrides); return data
state = new_state()

def human_clients(): return {pid:c for pid,c in clients.items() if not c.get("isBot")}
def bot_clients(): return [(pid,c) for pid,c in clients.items() if c.get("isBot")]
def default_upgrades(): return {"speed":0,"reload":0,"health":0,"projectile":0}

def tank(pid,x,y,a,color):
    c=clients.get(pid,{}); u=c.get("upgrades",{}); cls=c.get("tankClass",DEFAULT_CLASS); spec=class_spec(cls)
    hp=spec["hp"]+u.get("health",0)
    x,y=find_spawn(x,y,spec["radius"])
    if pid in clients: clients[pid]["color"]=color
    return {"id":pid,"x":x,"y":y,"a":a,"color":color,"hp":hp,"maxHp":hp,"reload":0,"speedBoost":0,"rapidFire":0,"shield":0,"input":{},"cls":cls,"r":spec["radius"],"vx":0,"vy":0,
            "homing":0,"spread":0,"rockets":0,"bouncy":0,"mines":0,"mineHeld":False,"outside":False}

def find_spawn(x,y,r):
    """Cherche la position libre la plus proche (verticalement puis horizontalement)."""
    if not hit_wall_circle(x,y,r+5): return x,y
    for delta in range(10,max(W,H),10):
        for nx,ny in ((x,y-delta),(x,y+delta),(x+delta,y),(x-delta,y)):
            if r+5<nx<W-r-5 and r+5<ny<H-r-5 and not hit_wall_circle(nx,ny,r+5): return nx,ny
    return x,y

def team_players():
    return [(pid,c) for pid,c in clients.items() if c.get("team") in FIGHTER_TEAMS]

def normalize_team(team):
    """Adapte une équipe demandée au mode courant : pas d'équipes en battle royale."""
    if team not in FIGHTER_TEAMS: return "spectator"
    if GAME_MODE=="br": return "player"
    if team in ("yellow","blue"): return team
    yellow=sum(1 for _,c in team_players() if c.get("team")=="yellow"); blue=sum(1 for _,c in team_players() if c.get("team")=="blue")
    return "yellow" if yellow<=blue else "blue"

def set_game_mode(mode):
    """Change de mode et replace les participants : tous « joueurs » en BR, répartis jaune/bleu en équipes."""
    global GAME_MODE
    if mode==GAME_MODE: return
    GAME_MODE=mode; state["gameMode"]=mode
    fighters=team_players()
    if mode=="br":
        for _,c in fighters: c["team"]="player"
    else:
        for _,c in fighters: c["team"]=None
        for _,c in fighters: c["team"]=normalize_team("player")

def max_powerups():
    return min(6,3+len(state["tanks"])//4) if GAME_MODE=="br" else MAX_POWERUPS

def make_tanks():
    if GAME_MODE=="br": return make_br_tanks()
    result=[]
    colors={"yellow":"#ffd24d","blue":"#75d8ff"}
    for team in ("yellow","blue"):
        members=[(pid,c) for pid,c in team_players() if c.get("team")==team]
        x=75 if team=="yellow" else W-75
        angle=0 if team=="yellow" else math.pi
        top=75; bottom=H-75; count=max(1,len(members))
        for index,(pid,c) in enumerate(members):
            y=H/2 if count==1 else top+(bottom-top)*(index/(count-1))
            result.append(tank(pid,x,y,angle,colors[team]))
    return result

def make_br_tanks():
    """Battle royale : les chars apparaissent en cercle le long des bords, tournés vers le centre."""
    players=team_players(); random.shuffle(players); n=max(1,len(players)); offset=random.uniform(0,math.tau); result=[]
    for i,(pid,c) in enumerate(players):
        ang=offset+math.tau*i/n
        x=W/2+math.cos(ang)*(W/2-80); y=H/2+math.sin(ang)*(H/2-70)
        result.append(tank(pid,x,y,math.atan2(H/2-y,W/2-x),BR_COLORS[i%len(BR_COLORS)]))
    return result

def free_br_color():
    used={t["color"] for t in state["tanks"]}
    return next((col for col in BR_COLORS if col not in used),random.choice(BR_COLORS))

def start_preparation(keep_score=True):
    global state
    score=state.get("score",[0,0]) if keep_score else [0,0]
    for _,c in team_players(): c["upgradeChosen"]=False
    MINES.clear()
    state=new_state(mode="game",phase="prep",score=score,running=True,prepTimer=10)

def begin_round():
    apply_map(CURRENT_MAP); state["map"]=public_map()
    state["phase"]="round"; state["tanks"]=make_tanks(); state["bullets"]=[]; state["winner"]=""; state["powerups"]=[]; state["powerTimer"]=3
    state["explosions"]=[]; MINES.clear(); state["zone"]=None
    if GAME_MODE=="br":
        # Zone de battle royale : centre un peu décalé, couvre toute la carte puis rétrécit.
        zx=W/2+random.uniform(-W*.15,W*.15); zy=H/2+random.uniform(-H*.15,H*.15)
        r0=max(math.hypot(cx-zx,cy-zy) for cx in (0,W) for cy in (0,H))+30
        state["zone"]={"x":zx,"y":zy,"r":r0,"startR":r0,"endR":max(80,min(W,H)*.12),"delay":12,"shrink":55,"t":0}

def reset_match(keep_score=False):
    for _,c in team_players():
        c["upgrades"]={"speed":0,"reload":0,"health":0,"projectile":0}
        c["kills"]=0; c["deaths"]=0; c["brWins"]=0
    start_preparation(keep_score)

def return_to_lobby():
    global state
    MINES.clear()
    state=new_state()

def sync_game_players():
    if state.get("mode")!="game": return
    wanted={pid:c for pid,c in team_players()}; existing={t["id"] for t in state["tanks"]}
    removed=[t for t in state["tanks"] if t["id"] not in wanted]
    state["tanks"]=[t for t in state["tanks"] if t["id"] in wanted]
    for pid,c in wanted.items():
        if pid not in existing:
            if GAME_MODE=="br": state["tanks"].append(tank(pid,random.uniform(80,W-80),random.uniform(80,H-80),0,free_br_color()))
            else: state["tanks"].append(tank(pid,95,H/2,0,"#ffd24d") if c["team"]=="yellow" else tank(pid,W-95,H/2,math.pi,"#75d8ff"))
    # Un joueur parti (ou passé spectateur) peut terminer la manche.
    for t in removed: check_round_end(t["color"],None)

def collides(x,y,r,w): return x+r>w["x"] and x-r<w["x"]+w["w"] and y+r>w["y"] and y-r<w["y"]+w["h"]
def hit_wall(x,y,r): return any(collides(x,y,r,w) for w in WALLS)
def circle_rect_hit(x,y,r,w):
    cx=max(w["x"],min(w["x"]+w["w"],x)); cy=max(w["y"],min(w["y"]+w["h"],y))
    return (x-cx)**2+(y-cy)**2<r*r
def hit_wall_circle(x,y,r): return any(circle_rect_hit(x,y,r,w) for w in WALLS)

def resolve_walls(t):
    """Repousse le char hors des murs (collision cercle / rectangle).
    Le char glisse le long des murs et contourne les angles au lieu de rester bloqué."""
    r=t.get("r",R)
    for _ in range(4):
        moved=False
        for w in WALLS:
            cx=max(w["x"],min(w["x"]+w["w"],t["x"])); cy=max(w["y"],min(w["y"]+w["h"],t["y"]))
            dx=t["x"]-cx; dy=t["y"]-cy; d2=dx*dx+dy*dy
            if d2>=r*r: continue
            if d2>1e-9:
                d=math.sqrt(d2); push=r-d+0.01; t["x"]+=dx/d*push; t["y"]+=dy/d*push
            else:
                # Centre à l'intérieur du mur : sortie par le côté le plus proche.
                left=t["x"]-w["x"]; right=w["x"]+w["w"]-t["x"]; top=t["y"]-w["y"]; bottom=w["y"]+w["h"]-t["y"]
                m=min(left,right,top,bottom)
                if m==left: t["x"]=w["x"]-r
                elif m==right: t["x"]=w["x"]+w["w"]+r
                elif m==top: t["y"]=w["y"]-r
                else: t["y"]=w["y"]+w["h"]+r
            moved=True
        t["x"]=max(r,min(W-r,t["x"])); t["y"]=max(r,min(H-r,t["y"]))
        if not moved: break
def spawn_powerup():
    zone=state.get("zone")
    for _ in range(100):
        x,y=random.randint(80,W-80),random.randint(70,H-70)
        if zone and math.hypot(x-zone["x"],y-zone["y"])>zone["r"]*.8: continue
        if hit_wall(x,y,24) or any(math.hypot(p["x"]-x,p["y"]-y)<120 for p in state["powerups"]): continue
        if all(math.hypot(t["x"]-x,t["y"]-y)>90 for t in state["tanks"]):
            state["powerups"].append({"x":x,"y":y,"type":random.choice(POWER_TYPES)}); return

def apply_powerup(t,kind):
    if kind=="speed": t["speedBoost"]=6
    elif kind=="rapid": t["rapidFire"]=6
    elif kind=="shield": t["shield"]=8
    elif kind=="homing": t["homing"]=6                         # tirs téléguidés pendant 6 s
    elif kind=="spread": t["spread"]=6                         # tir en 5 directions pendant 6 s
    elif kind=="rocket": t["rockets"]=min(3,t["rockets"]+1)    # 1 roquette explosive
    elif kind=="bouncy": t["bouncy"]=min(3,t["bouncy"]+1)      # 1 obus qui rebondit jusqu'à toucher
    elif kind=="mine": t["mines"]=min(4,t["mines"]+2)          # 2 mines à poser avec E

def muzzle_point(t,angle):
    """Bout du canon, ou juste avant le mur si le canon traverse un mur."""
    ca,sa=math.cos(angle),math.sin(angle); dist=t.get("r",R)+12
    while dist>0 and hit_wall(t["x"]+ca*dist,t["y"]+sa*dist,5): dist-=3
    return t["x"]+ca*max(0,dist),t["y"]+sa*max(0,dist)

def fire(t,angle,speed,kind="normal",**extra):
    spec=class_spec(t.get("cls")); x,y=muzzle_point(t,angle)
    bullet={"x":x,"y":y,"vx":math.cos(angle)*speed,"vy":math.sin(angle)*speed,"owner":t["id"],"color":t["color"],"bounces":0,
            "maxBounces":spec["bounces"],"dmg":spec["damage"],"cls":t.get("cls"),"kind":kind,"age":0}
    bullet.update(extra); state["bullets"].append(bullet)

def place_mine(t):
    global MINE_SEQ
    ca,sa=math.cos(t["a"]),math.sin(t["a"]); back=t.get("r",R)+14
    x,y=t["x"]-ca*back,t["y"]-sa*back
    if hit_wall(x,y,10) or not (10<x<W-10 and 10<y<H-10): x,y=t["x"],t["y"]
    MINE_SEQ+=1; t["mines"]-=1
    MINES.append({"id":MINE_SEQ,"x":x,"y":y,"owner":t["id"],"color":t["color"],"age":0})

def update_tank(t,dt):
    i=t.get("input",{}); t["speedBoost"]=max(0,t["speedBoost"]-dt); t["rapidFire"]=max(0,t["rapidFire"]-dt); t["shield"]=max(0,t["shield"]-dt)
    spec=class_spec(t.get("cls")); u=clients.get(t["id"],{}).get("upgrades",{})
    turn=2.8*spec["turn"]
    if i.get("l"): t["a"]-=turn*dt
    if i.get("r"): t["a"]+=turn*dt
    d=(1 if i.get("f") else 0)-(0.7 if i.get("b") else 0)
    base_speed=140*spec["speed"]*(1+0.12*u.get("speed",0)); speed=base_speed*1.46 if t["speedBoost"]>0 else base_speed
    target_vx=math.cos(t["a"])*speed*d; target_vy=math.sin(t["a"])*speed*d
    ice=MAP_INFO.get("ice")
    if ice:
        # Banquise : le char garde son élan et met du temps à changer de direction.
        k=min(1,dt*2.3); t["vx"]=t.get("vx",0)+(target_vx-t.get("vx",0))*k; t["vy"]=t.get("vy",0)+(target_vy-t.get("vy",0))*k
    else:
        t["vx"],t["vy"]=target_vx,target_vy
    ox,oy=t["x"],t["y"]
    t["x"]+=t["vx"]*dt; t["y"]+=t["vy"]*dt
    resolve_walls(t)
    if ice and dt>0: t["vx"]=(t["x"]-ox)/dt; t["vy"]=(t["y"]-oy)/dt
    t["homing"]=max(0,t.get("homing",0)-dt); t["spread"]=max(0,t.get("spread",0)-dt)
    if i.get("mine") and not t.get("mineHeld") and t.get("mines",0)>0: place_mine(t)
    t["mineHeld"]=bool(i.get("mine"))
    t["reload"]-=dt
    if i.get("shoot") and t["reload"]<=0:
        base_reload=0.65*spec["reload"]*(1-0.12*u.get("reload",0)); t["reload"]=base_reload*0.4 if t["rapidFire"]>0 else base_reload
        bullet_speed=BULLET_SPEED*spec["bullet"]*(1+0.15*u.get("projectile",0))
        if t.get("rockets",0)>0:
            t["rockets"]-=1; t["reload"]=max(t["reload"],0.55)
            fire(t,t["a"],bullet_speed*0.75,"rocket",dmg=2)
        elif t.get("bouncy",0)>0:
            t["bouncy"]-=1
            fire(t,t["a"],bullet_speed,"bouncy",maxBounces=10**9)
        else:
            kind="homing" if t.get("homing",0)>0 else "normal"
            angles=[t["a"]+d for d in (-.36,-.18,0,.18,.36)] if t.get("spread",0)>0 else [t["a"]]
            for angle in angles: fire(t,angle,bullet_speed,kind)

NAV_STEP=40
NAV_MARGIN=R+9

def point_blocked(x,y,margin=NAV_MARGIN):
    if x<margin or y<margin or x>W-margin or y>H-margin: return True
    return any(w["x"]-margin<x<w["x"]+w["w"]+margin and w["y"]-margin<y<w["y"]+w["h"]+margin for w in WALLS)

def world_to_cell(x,y): return (int(x//NAV_STEP),int(y//NAV_STEP))
def cell_to_world(cell): return (cell[0]*NAV_STEP+NAV_STEP/2,cell[1]*NAV_STEP+NAV_STEP/2)
def nearest_free_cell(cell):
    if not point_blocked(*cell_to_world(cell)): return cell
    for radius in range(1,7):
        for dx in range(-radius,radius+1):
            for dy in (-radius,radius):
                candidate=(cell[0]+dx,cell[1]+dy)
                if not point_blocked(*cell_to_world(candidate)): return candidate
        for dy in range(-radius+1,radius):
            for dx in (-radius,radius):
                candidate=(cell[0]+dx,cell[1]+dy)
                if not point_blocked(*cell_to_world(candidate)): return candidate
    return cell

def find_path(start_xy,goal_xy):
    start=nearest_free_cell(world_to_cell(*start_xy)); goal=nearest_free_cell(world_to_cell(*goal_xy))
    if start==goal: return [goal_xy]
    frontier=[(0,start)]; came={start:None}; cost={start:0}
    directions=((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1))
    while frontier:
        _,current=heapq.heappop(frontier)
        if current==goal: break
        for dx,dy in directions:
            nxt=(current[0]+dx,current[1]+dy); wx,wy=cell_to_world(nxt)
            if point_blocked(wx,wy): continue
            if dx and dy:
                if point_blocked(*cell_to_world((current[0]+dx,current[1]))) or point_blocked(*cell_to_world((current[0],current[1]+dy))): continue
            new_cost=cost[current]+(1.414 if dx and dy else 1)
            if nxt not in cost or new_cost<cost[nxt]:
                cost[nxt]=new_cost; priority=new_cost+math.hypot(goal[0]-nxt[0],goal[1]-nxt[1]); heapq.heappush(frontier,(priority,nxt)); came[nxt]=current
    if goal not in came: return []
    cells=[]; current=goal
    while current not in (None,start): cells.append(current); current=came[current]
    cells.reverse(); return [cell_to_world(cell) for cell in cells]

def clear_line(x1,y1,x2,y2,margin=7):
    distance=math.hypot(x2-x1,y2-y1); steps=max(1,int(distance/10))
    for i in range(1,steps):
        ratio=i/steps; x=x1+(x2-x1)*ratio; y=y1+(y2-y1)*ratio
        if any(w["x"]-margin<x<w["x"]+w["w"]+margin and w["y"]-margin<y<w["y"]+w["h"]+margin for w in WALLS): return False
    return True

def choose_combat_position(own,target,bot,now):
    # Keep the same tactical destination briefly. Recomputing it every frame caused left-right oscillation.
    cached=bot.get("combatGoal")
    if cached and now<bot.get("combatGoalUntil",0) and not point_blocked(*cached): return cached
    difficulty=bot.get("difficulty","normal"); radius=205 if difficulty=="hard" else 175
    radius+={"sniper":95,"heavy":-25}.get(bot.get("tankClass"),0)
    base=math.atan2(own["y"]-target["y"],own["x"]-target["x"])
    # Alternate the orbit side after each hold period so a visible target does not freeze the bot forever.
    orbit_side=bot.get("orbitSide",1)
    bot["orbitSide"]=-orbit_side
    candidates=[]
    preferred=(orbit_side*math.pi/3,-orbit_side*math.pi/3,orbit_side*2*math.pi/3,-orbit_side*2*math.pi/3,0,math.pi)
    for offset in preferred:
        angle=base+offset; candidate=(target["x"]+math.cos(angle)*radius,target["y"]+math.sin(angle)*radius)
        if point_blocked(*candidate): continue
        path=find_path((own["x"],own["y"]),candidate)
        if not path: continue
        path_length=sum(math.hypot(path[i][0]-(own["x"] if i==0 else path[i-1][0]),path[i][1]-(own["y"] if i==0 else path[i-1][1])) for i in range(len(path)))
        firing_position=clear_line(candidate[0],candidate[1],target["x"],target["y"])
        # Prefer a position with a clean shot, then the shortest viable route.
        score=path_length-(260 if firing_position else 0)+abs(offset)*12
        candidates.append((score,candidate))
    goal=min(candidates,key=lambda item:item[0])[1] if candidates else (target["x"],target["y"])
    hold={"easy":2.8,"normal":2.0,"hard":1.35}.get(difficulty,2.0)
    bot["combatGoal"]=goal; bot["combatGoalUntil"]=now+hold
    return goal

def powerup_key(power):
    return None if not power else (round(power["x"],2),round(power["y"],2),power["type"])

def choose_bot_goal(own,targets,bot,now):
    target=min(targets,key=lambda t:math.hypot(t["x"]-own["x"],t["y"]-own["y"]))
    zone=state.get("zone")
    if zone and math.hypot(own["x"]-zone["x"],own["y"]-zone["y"])>zone["r"]-70:
        # Hors (ou au bord) de la zone : on rentre vers le centre en priorité.
        bot["objectiveType"]="zone"
        return (zone["x"],zone["y"]),target
    powers=state.get("powerups",[]); keys={powerup_key(p) for p in powers}
    power=min(powers,key=lambda p:math.hypot(p["x"]-own["x"],p["y"]-own["y"])) if powers else None; current_key=powerup_key(power)
    # Once a bot commits to a bonus, keep that decision until the bonus disappears,
    # is reached, becomes invalid, or the commitment expires.
    if bot.get("objectiveType")=="powerup":
        same_bonus=bot.get("objectiveKey") in keys
        objective=bot.get("objectivePoint")
        if same_bonus and objective and now<bot.get("objectiveUntil",0):
            distance=math.hypot(objective[0]-own["x"],objective[1]-own["y"])
            if distance>24:
                return objective,target
        bot["objectiveType"]=None; bot["objectivePoint"]=None; bot["objectiveKey"]=None; bot["path"]=[]; bot["nextPathAt"]=0
    difficulty=bot.get("difficulty","normal")
    if power:
        pd=math.hypot(power["x"]-own["x"],power["y"]-own["y"]); td=math.hypot(target["x"]-own["x"],target["y"]-own["y"])
        threshold={"easy":180,"normal":270,"hard":350}.get(difficulty,270)
        # Deterministic decision prevents frame-by-frame random switching.
        health_need=own.get("hp",3)<own.get("maxHp",3)
        useful=health_need if power["type"]=="shield" else True
        if pd<threshold and pd<td*0.95 and useful:
            bot["objectiveType"]="powerup"; bot["objectivePoint"]=(power["x"],power["y"]); bot["objectiveKey"]=current_key; bot["objectiveUntil"]=now+4.0; bot["path"]=[]; bot["nextPathAt"]=0
            return bot["objectivePoint"],target
    bot["objectiveType"]="combat"
    visible=clear_line(own["x"],own["y"],target["x"],target["y"])
    distance=math.hypot(target["x"]-own["x"],target["y"]-own["y"])
    near,far={"sniper":(190,380),"heavy":(100,220)}.get(bot.get("tankClass"),(125,260))
    if visible and near<=distance<=far:
        hold_until=bot.get("firingHoldUntil",0)
        if hold_until==0:
            bot["firingHoldUntil"]=now+{"easy":2.5,"normal":1.7,"hard":1.1}.get(difficulty,1.7)
            return (own["x"],own["y"]),target
        if now<hold_until:
            return (own["x"],own["y"]),target
        # The firing pause is over: force a new lateral combat position.
        bot["firingHoldUntil"]=0; bot["combatGoalUntil"]=0; bot["path"]=[]; bot["nextPathAt"]=0
    else:
        bot["firingHoldUntil"]=0
    return choose_combat_position(own,target,bot,now),target

def update_bot_ai(dt):
    if state.get("phase")!="round": return
    now=time.monotonic()
    for bot_id,bot in bot_clients():
        own=next((t for t in state["tanks"] if t["id"]==bot_id),None)
        if not own: continue
        targets=[t for t in state["tanks"] if t["color"]!=own["color"] and t.get("hp",0)>0]
        if not targets: own["input"]={}; continue
        goal,target=choose_bot_goal(own,targets,bot,now); difficulty=bot.get("difficulty","normal")
        refresh={"easy":1.0,"normal":0.55,"hard":0.28}.get(difficulty,0.55)
        old_goal=bot.get("navGoal"); moved_goal=not old_goal or math.hypot(goal[0]-old_goal[0],goal[1]-old_goal[1])>70
        if now>=bot.get("nextPathAt",0) or moved_goal or not bot.get("path"):
            bot["path"]=find_path((own["x"],own["y"]),goal); bot["navGoal"]=goal; bot["nextPathAt"]=now+refresh
        path=bot.get("path",[])
        while path and math.hypot(path[0][0]-own["x"],path[0][1]-own["y"])<28: path.pop(0)
        waypoint=path[0] if path else goal
        goal_distance=math.hypot(goal[0]-own["x"],goal[1]-own["y"])
        visible=clear_line(own["x"],own["y"],target["x"],target["y"])
        target_angle=math.atan2(target["y"]-own["y"],target["x"]-own["x"])
        arrival_distance=12 if bot.get("objectiveType")=="powerup" else 34
        navigating=goal_distance>arrival_distance
        pursuing_powerup=bot.get("objectiveType")=="powerup"
        desired=math.atan2(waypoint[1]-own["y"],waypoint[0]-own["x"]) if navigating or pursuing_powerup else target_angle
        diff=(desired-own["a"]+math.pi)%(2*math.pi)-math.pi
        # Hysteresis: keep the previous turn direction until the error is genuinely small.
        previous_turn=bot.get("turnDirection",0); enter=0.16; leave=0.07
        if previous_turn<0 and diff<-leave: turn=-1
        elif previous_turn>0 and diff>leave: turn=1
        elif diff<-enter: turn=-1
        elif diff>enter: turn=1
        else: turn=0
        bot["turnDirection"]=turn
        last_pos=bot.get("lastPosition",(own["x"],own["y"])); trying_to_move=navigating and abs(diff)<0.75
        bot["stuckTimer"]=bot.get("stuckTimer",0)+dt if trying_to_move and math.hypot(own["x"]-last_pos[0],own["y"]-last_pos[1])<1.0 else 0
        bot["lastPosition"]=(own["x"],own["y"]); stuck=bot["stuckTimer"]>0.75
        if stuck:
            bot["nextPathAt"]=0; bot["combatGoalUntil"]=0; bot["stuckTimer"]=0
        aim_diff=(target_angle-own["a"]+math.pi)%(2*math.pi)-math.pi
        aim_limit={"easy":0.22,"normal":0.13,"hard":0.075}.get(difficulty,0.13)
        drop_mine=own.get("mines",0)>0 and math.hypot(target["x"]-own["x"],target["y"]-own["y"])<240 and random.random()<dt*0.8
        own["input"]={"mine":drop_mine,"l":turn<0,"r":turn>0,"f":navigating and not stuck and abs(diff)<0.70,"b":stuck,"shoot":not pursuing_powerup and visible and abs(aim_diff)<aim_limit}

def choose_bot_upgrade():
    upgrade_names=("speed","reload","health","projectile")
    for _,bot in bot_clients():
        if bot.get("upgradeChosen"): continue
        available=[name for name in upgrade_names if bot["upgrades"].get(name,0)<3]
        if not available:
            bot["upgradeChosen"]=True
            continue
        difficulty=bot.get("difficulty","normal")
        if difficulty=="easy":
            # Facile : aucune stratégie, le choix est entièrement aléatoire.
            choice=random.choice(available)
        elif difficulty=="hard":
            # Difficile : monte une caractéristique au niveau 3 avant d'en changer.
            speciality=bot.get("speciality")
            if speciality not in available:
                speciality=max(available,key=lambda name:bot["upgrades"].get(name,0))
                if bot["upgrades"].get(speciality,0)==0:
                    speciality=random.choice(available)
                bot["speciality"]=speciality
            choice=speciality
        else:
            # Normal : alterne décisions spécialisées et choix imprévisibles.
            speciality=bot.get("speciality")
            if speciality not in available:
                speciality=random.choice(available)
                bot["speciality"]=speciality
            choice=speciality if random.random()<0.6 else random.choice(available)
        bot["upgrades"][choice]=bot["upgrades"].get(choice,0)+1
        bot["lastUpgrade"]=choice
        bot["upgradeChosen"]=True

def register_kill(killer_id,victim):
    global KILL_SEQ
    victim_client=clients.get(victim["id"])
    if victim_client: victim_client["deaths"]=victim_client.get("deaths",0)+1
    killer=clients.get(killer_id) if killer_id!=victim["id"] else None
    if killer: killer["kills"]=killer.get("kills",0)+1
    shooter=next((t for t in state["tanks"] if t["id"]==killer_id),None) or victim
    KILL_SEQ+=1; state["killSeq"]=KILL_SEQ
    color=(killer or {}).get("color") or shooter["color"]
    # victimId permet au navigateur du joueur tué (et à lui seul) d'afficher le screamer.
    event={"seq":KILL_SEQ,"id":killer_id,"kills":(killer or {}).get("kills",0),"noKill":not killer,"x":shooter["x"],"y":shooter["y"],"color":color,"ttl":1.35,
           "killer":(killer or {}).get("name",""),"victim":victim_client.get("name","") if victim_client else "","victimId":victim["id"]}
    state.setdefault("killEvents",[]).append(event)

def damage_tank(t,dmg,killer_id,pierce_shield=False):
    if t.get("hp",0)<=0: return
    if t["shield"]>0 and not pierce_shield: t["shield"]=0; return
    t["hp"]-=dmg
    if t["hp"]<=0: kill_tank(t,killer_id)

def kill_tank(t,killer_id):
    register_kill(killer_id,t)
    state["tanks"]=[other for other in state["tanks"] if other["id"]!=t["id"]]
    check_round_end(t["color"],killer_id)

def check_round_end(dead_color,killer_id):
    if not state["running"] or state["roundDelay"]>0 or state.get("phase")!="round": return
    if GAME_MODE!="br":
        finish_round_if_team_eliminated(dead_color,killer_id); return
    if not state["tanks"] and not team_players(): return
    alive=state["tanks"]
    if len(alive)>1: return
    state["bullets"]=[]
    winner=alive[0] if alive else None
    wins=0
    if winner and winner["id"] in clients:
        c=clients[winner["id"]]; c["brWins"]=c.get("brWins",0)+1; wins=c["brWins"]; state["winner"]=winner["id"]
    if wins>=BR_WINS_NEEDED: state["running"]=False; state["returnTimer"]=6
    else: state["roundDelay"]=1.2

def explode(x,y,radius,dmg,owner,color):
    """Explosion de zone (roquette, mine) : blesse les ennemis proches et détruit les caisses."""
    global FX_SEQ
    FX_SEQ+=1; state["explosions"].append({"seq":FX_SEQ,"x":x,"y":y,"r":radius,"ttl":0.8})
    for w in list(WALLS):
        if w.get("kind")=="crate" and circle_rect_hit(x,y,radius*.8,w):
            w["hp"]=w.get("hp",CRATE_HP)-2
            if w["hp"]<=0: WALLS.remove(w)
    for t in list(state["tanks"]):
        if t["id"]!=owner and t["color"]!=color and math.hypot(t["x"]-x,t["y"]-y)<radius+t.get("r",R)*.5:
            damage_tank(t,dmg,owner)

def update_mines(dt):
    for m in list(MINES):
        m["age"]+=dt
        if m["age"]<1.0: continue  # armement
        for t in state["tanks"]:
            if t["id"]!=m["owner"] and t["color"]!=m["color"] and math.hypot(t["x"]-m["x"],t["y"]-m["y"])<t.get("r",R)+12:
                MINES.remove(m); explode(m["x"],m["y"],72,2,m["owner"],m["color"]); break

def update_zone(dt):
    zone=state.get("zone")
    if not zone: return
    zone["t"]+=dt
    progress=min(1,max(0,(zone["t"]-zone["delay"])/zone["shrink"]))
    zone["r"]=zone["startR"]+(zone["endR"]-zone["startR"])*progress
    for t in list(state["tanks"]):
        outside=math.hypot(t["x"]-zone["x"],t["y"]-zone["y"])>zone["r"]
        t["outside"]=outside
        if not outside: t["zoneTick"]=0; continue
        t["zoneTick"]=t.get("zoneTick",0)+dt
        if t["zoneTick"]>=1.5:
            t["zoneTick"]=0; damage_tank(t,1,None,pierce_shield=True)

def nearest_enemy(b,max_dist):
    best=None; best_d=max_dist
    for t in state["tanks"]:
        if t["id"]==b["owner"] or t["color"]==b["color"]: continue
        d=math.hypot(t["x"]-b["x"],t["y"]-b["y"])
        if d<best_d: best,best_d=t,d
    return best

def finish_round_if_team_eliminated(eliminated_color,killer_id):
    alive=[t for t in state["tanks"] if t.get("hp",0)>0]
    if any(t["color"]==eliminated_color for t in alive): return False
    winning_color="#75d8ff" if eliminated_color=="#ffd24d" else "#ffd24d"
    winners=[t for t in alive if t["color"]==winning_color]
    if not winners: return False
    score_index=0 if winning_color=="#ffd24d" else 1
    state["score"][score_index]+=1
    state["winner"]=killer_id if any(t["id"]==killer_id for t in winners) else winners[0]["id"]
    state["bullets"]=[]
    if state["score"][score_index]>=TEAM_WINS_NEEDED:
        state["running"]=False; state["returnTimer"]=6
    else:
        state["roundDelay"]=0.8
    return True

def step_bullet(b,dt):
    kind=b.get("kind","normal"); b["age"]=b.get("age",0)+dt
    if kind=="bouncy" and b["age"]>25: b["dead"]=True; return   # sécurité : pas d'obus éternel
    if kind=="homing" and b["age"]>0.08:
        # Téléguidage : l'obus tourne progressivement vers l'ennemi le plus proche.
        target=nearest_enemy(b,480)
        if target:
            speed=math.hypot(b["vx"],b["vy"]); current=math.atan2(b["vy"],b["vx"])
            wanted=math.atan2(target["y"]-b["y"],target["x"]-b["x"])
            diff=(wanted-current+math.pi)%math.tau-math.pi; turn=max(-3.4*dt,min(3.4*dt,diff))
            b["vx"]=math.cos(current+turn)*speed; b["vy"]=math.sin(current+turn)*speed
    b["x"]+=b["vx"]*dt; b["y"]+=b["vy"]*dt
    bounced=False
    if b["x"]<5 or b["x"]>W-5:
        b["vx"]*=-1; b["x"]=max(5,min(W-5,b["x"])); bounced=True
    if b["y"]<5 or b["y"]>H-5:
        b["vy"]*=-1; b["y"]=max(5,min(H-5,b["y"])); bounced=True
    if bounced and kind=="rocket":
        b["dead"]=True; explode(b["x"],b["y"],78,b.get("dmg",2),b["owner"],b["color"]); return
    for w in WALLS:
        if collides(b["x"],b["y"],5,w):
            if kind=="rocket":
                b["x"]-=b["vx"]*dt; b["y"]-=b["vy"]*dt; b["dead"]=True
                explode(b["x"],b["y"],78,b.get("dmg",2),b["owner"],b["color"]); return
            if w.get("kind")=="crate":
                # Les caisses encaissent l'obus puis cèdent.
                w["hp"]=w.get("hp",CRATE_HP)-b.get("dmg",1); b["dead"]=True
                if w["hp"]<=0: WALLS.remove(w)
                return
            cx=max(w["x"],min(w["x"]+w["w"],b["x"])); cy=max(w["y"],min(w["y"]+w["h"],b["y"]))
            # Recule l'obus hors du mur, puis le fait rebondir sur la face touchée.
            b["x"]-=b["vx"]*dt; b["y"]-=b["vy"]*dt
            if abs(b["x"]-cx)>abs(b["y"]-cy): b["vx"]*=-1
            else: b["vy"]*=-1
            bounced=True
            break
    if bounced:
        b["bounces"]=b.get("bounces",0)+1
        if b["bounces"]>b.get("maxBounces",2)-1: b["dead"]=True; return
    for t in state["tanks"]:
        if t["id"]!=b["owner"] and t["color"]!=b["color"] and math.hypot(t["x"]-b["x"],t["y"]-b["y"])<t.get("r",R)+5:
            b["dead"]=True
            if kind=="rocket": explode(b["x"],b["y"],78,b.get("dmg",2),b["owner"],b["color"])
            else: damage_tank(t,b.get("dmg",1),b["owner"])
            return

def update_game(dt):
    global PICKUP_SEQ
    if state.get("mode")!="game": return
    if not state["running"]:
        state["returnTimer"]-=dt
        if state["returnTimer"]<=0: return_to_lobby()
        return
    if state.get("phase")=="prep":
        choose_bot_upgrade()
        state["prepTimer"]-=dt
        if state["prepTimer"]<=0: begin_round()
        return
    if state["roundDelay"]>0:
        state["roundDelay"]-=dt
        if state["roundDelay"]<=0: start_preparation(True)
        return
    update_bot_ai(dt)
    for key in ("killEvents","explosions","pickups"):
        for event in state.get(key,[]): event["ttl"]-=dt
        state[key]=[event for event in state.get(key,[]) if event["ttl"]>0]
    state["powerTimer"]-=dt
    if len(state["powerups"])<max_powerups() and state["powerTimer"]<=0:
        spawn_powerup(); state["powerTimer"]=4
    update_zone(dt)
    update_mines(dt)
    for t in list(state["tanks"]):
        update_tank(t,dt)
        p=next((p for p in state["powerups"] if math.hypot(t["x"]-p["x"],t["y"]-p["y"])<36),None)
        if p:
            apply_powerup(t,p["type"])
            PICKUP_SEQ+=1; state["pickups"].append({"seq":PICKUP_SEQ,"x":p["x"],"y":p["y"],"type":p["type"],"id":t["id"],"ttl":1.0})
            collected_key=powerup_key(p)
            state["powerups"].remove(p)
            for _,bot_data in bot_clients():
                if bot_data.get("objectiveKey")==collected_key:
                    bot_data["objectiveType"]=None; bot_data["objectivePoint"]=None; bot_data["objectiveKey"]=None; bot_data["path"]=[]; bot_data["nextPathAt"]=0
    for b in state["bullets"]:
        steps=max(1,math.ceil(math.hypot(b["vx"],b["vy"])*dt/8))
        for _ in range(steps):
            if b.get("dead"): break
            step_bullet(b,dt/steps)
    state["bullets"]=[b for b in state["bullets"] if not b.get("dead")]

def recv_exact(sock,n):
    data=b''
    while len(data)<n:
        chunk=sock.recv(n-len(data))
        if not chunk: raise ConnectionError
        data+=chunk
    return data

def recv_frame(sock):
    a,b=recv_exact(sock,2); opcode=a&15; length=b&127
    if length==126: length=int.from_bytes(recv_exact(sock,2),'big')
    elif length==127: length=int.from_bytes(recv_exact(sock,8),'big')
    mask=recv_exact(sock,4) if b&128 else None; payload=recv_exact(sock,length) if length else b''
    if mask: payload=bytes(v^mask[i%4] for i,v in enumerate(payload))
    return opcode,payload

def send_frame(sock,payload,opcode=1):
    if isinstance(payload,str): payload=payload.encode()
    n=len(payload); head=bytes([0x80|opcode]); head+=bytes([n]) if n<126 else bytes([126])+n.to_bytes(2,'big') if n<65536 else bytes([127])+n.to_bytes(8,'big'); sock.sendall(head+payload)
def safe_send(c,obj):
    try:
        with c["send_lock"]: send_frame(c["sock"],json.dumps(obj,separators=(',',':')))
        return True
    except: return False
def visible_mines(pid):
    """Une mine est visible par tous pendant 1,5 s, puis seulement par son poseur (et ses coéquipiers)."""
    c=clients.get(pid,{}); spectator=c.get("team") not in FIGHTER_TEAMS
    my_color=next((t["color"] for t in state["tanks"] if t["id"]==pid),c.get("color"))
    allies_share=GAME_MODE!="br"
    result=[]
    for m in MINES:
        mine_owner=m["owner"]==pid
        if m["age"]<1.5 or spectator or mine_owner or (allies_share and m["color"]==my_color):
            result.append({"id":m["id"],"x":round(m["x"],1),"y":round(m["y"],1),"color":m["color"],"own":mine_owner,"hidden":m["age"]>=1.5,"armed":m["age"]>=1.0})
    return result

def safe_send_raw(c,text):
    try:
        with c["send_lock"]: send_frame(c["sock"],text)
        return True
    except: return False

def roster(): return [{"id":pid,"name":c["name"],"team":c.get("team","spectator"),"host":c.get("host",False),"upgrades":c.get("upgrades",{}),"upgradeChosen":c.get("upgradeChosen",False),"isBot":c.get("isBot",False),"difficulty":c.get("difficulty","normal"),"speciality":c.get("speciality"),"lastUpgrade":c.get("lastUpgrade"),"kills":c.get("kills",0),"deaths":c.get("deaths",0),"tankClass":c.get("tankClass",DEFAULT_CLASS),"brWins":c.get("brWins",0),"color":c.get("color")} for pid,c in clients.items()]

def process_client_message(pid,msg):
    c=clients.get(pid)
    if not c: return False
    kind=msg.get("type")
    if kind=="name": c["name"]=str(msg.get("name") or c["name"])[:16]
    elif kind=="remove_bot" and c.get("host"):
        bot_id=str(msg.get("botId",""))
        removed=bool(bot_id in clients and clients[bot_id].get("isBot"))
        if removed: del clients[bot_id]
        safe_send(c,{"type":"bot_removed","botId":bot_id,"removed":removed})
    elif kind=="game_mode" and c.get("host") and state.get("mode")=="lobby":
        if msg.get("gameMode") in ("teams","br"): set_game_mode(msg["gameMode"])
    elif kind=="tank_class" and state.get("mode")=="lobby":
        if msg.get("tankClass") in TANK_CLASSES: c["tankClass"]=msg["tankClass"]
    elif kind=="team":
        requested=msg.get("team")
        if requested in FIGHTER_TEAMS+("spectator",): c["team"]=normalize_team(requested); sync_game_players()
    elif kind=="bot" and c.get("host") and state.get("mode")=="lobby":
        action=msg.get("action"); team=msg.get("team")
        if action=="add" and team in FIGHTER_TEAMS:
            team=normalize_team(team)
            index=1; existing={data.get("name") for data in clients.values() if data.get("isBot")}
            while f"BOT {index}" in existing: index+=1
            bot_id=f"bot-{time.time_ns()}"
            cls=msg.get("tankClass"); cls=cls if cls in TANK_CLASSES else random.choice(list(TANK_CLASSES))
            clients[bot_id]={"name":f"BOT {index}","team":team,"host":False,"isBot":True,"difficulty":msg.get("difficulty","normal"),"upgrades":default_upgrades(),"upgradeChosen":False,"speciality":None,"lastUpgrade":None,"kills":0,"deaths":0,"tankClass":cls,"path":[]}
        elif action=="remove":
            bot_id=str(msg.get("id",""))
            if bot_id in clients and clients[bot_id].get("isBot"): del clients[bot_id]
    elif kind=="map" and c.get("host") and state.get("mode")=="lobby":
        map_id=str(msg.get("mapId",""))
        if map_id in MAPS:
            apply_map(map_id); state["map"]=public_map()
    elif kind=="start" and c.get("host") and state.get("mode")=="lobby":
        if len(team_players())>=(2 if GAME_MODE=="br" else 1): reset_match(False)
    elif kind=="upgrade" and state.get("phase")=="prep" and not c.get("upgradeChosen"):
        upgrade=msg.get("upgrade")
        if upgrade in ("speed","reload","health","projectile") and c["upgrades"].get(upgrade,0)<3: c["upgrades"][upgrade]=c["upgrades"].get(upgrade,0)+1; c["upgradeChosen"]=True
    elif kind=="input":
        for t in state["tanks"]:
            if t["id"]==pid: t["input"]=msg.get("input",{})
    elif kind=="abandon_match" and state.get("mode")=="game":
        return_to_lobby()
    elif kind=="forfeit" and state.get("phase")=="round" and GAME_MODE=="br":
        own=next((t for t in state["tanks"] if t["id"]==pid),None)
        if own: kill_tank(own,None)   # en battle royale, abandonner = s'autodétruire
    elif kind=="forfeit" and state.get("phase")=="round":
        enemies=[t for t in state["tanks"] if t["id"]!=pid and t["color"]!=next((x["color"] for x in state["tanks"] if x["id"]==pid),None)]
        if enemies:
            winner=enemies[0]; idx=0 if winner["color"]=="#ffd24d" else 1; state["score"][idx]+=1; state["winner"]=winner["id"]
            if state["score"][idx]>=5: state["running"]=False; state["returnTimer"]=5
            else: state["roundDelay"]=0.8
        else: start_preparation(True)
    elif kind=="lobby": return_to_lobby()
    return True

def websocket_session(sock):
    global next_id
    try: sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except OSError: pass
    with lock:
        if len(human_clients())>=16: send_frame(sock,json.dumps({"type":"full"})); return
        pid=str(next_id); next_id+=1; c={"sock":sock,"name":f"Joueur {pid}","team":"spectator","host":len(human_clients())==0,"upgrades":{"speed":0,"reload":0,"health":0,"projectile":0},"upgradeChosen":False,"kills":0,"deaths":0,"tankClass":DEFAULT_CLASS,"send_lock":threading.Lock()}; clients[pid]=c
    safe_send(c,{"type":"welcome","id":pid,"maps":map_catalog(),"classes":TANK_CLASSES})
    try:
        while True:
            opcode,payload=recv_frame(sock)
            if opcode==8: break
            if opcode==9:
                with c["send_lock"]: send_frame(sock,payload,10)
                continue
            if opcode!=1: continue
            msg=json.loads(payload.decode())
            with lock:
                process_client_message(pid,msg)
    except: pass
    finally:
        with lock:
            clients.pop(pid,None)
            humans=human_clients()
            if humans and not any(v.get("host") for v in humans.values()): next(iter(humans.values()))["host"]=True
            sync_game_players()
        try: sock.close()
        except: pass

def game_loop():
    last=time.monotonic(); clock=0
    while True:
        now=time.monotonic(); dt=min(now-last,.034); last=now; clock+=dt
        with lock:
            update_game(dt)
            if clock>=1/40:
                head='{"type":"state","state":'+json.dumps(state,separators=(',',':'))+',"players":'+json.dumps(roster(),separators=(',',':'))+',"mines":'
                dead=[pid for pid,c in list(clients.items()) if not c.get("isBot") and not safe_send_raw(c,head+json.dumps(visible_mines(pid),separators=(',',':'))+'}')]
                for pid in dead: clients.pop(pid,None)
                if dead: sync_game_players()
                clock=0
        time.sleep(1/120)

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self,path): return str(ROOT/(urlparse(path).path.lstrip('/') or 'index.html'))
    def log_message(self,fmt,*args): pass
    def do_GET(self):
        if urlparse(self.path).path=='/ws' and self.headers.get('Upgrade','').lower()=='websocket':
            key=self.headers.get('Sec-WebSocket-Key',''); accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101,'Switching Protocols'); self.send_header('Upgrade','websocket'); self.send_header('Connection','Upgrade'); self.send_header('Sec-WebSocket-Accept',accept); self.end_headers(); websocket_session(self.connection); return
        super().do_GET()
def local_ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); ip=s.getsockname()[0]; s.close(); return ip
    except: return '127.0.0.1'
if __name__=='__main__':
    threading.Thread(target=game_loop,daemon=True).start(); print(f'\nTank en carton est lance.\nSur ce PC : http://localhost:{PORT}\nDepuis l autre PC : http://{local_ip()}:{PORT}\n'); threading.Timer(1,lambda:webbrowser.open(f'http://localhost:{PORT}')).start(); ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
