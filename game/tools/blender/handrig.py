"""Rig de dedos para a mão do soldado (a malha vem do jogo e não tem dedos: é uma luva "luva de boxe" com 4 dedos juntos e um polegar).
Tudo aqui trabalha no ESPAÇO DO MODELO do soldado (unidades do jogo, Y para cima, braços em T ao longo de X), sem escala.

Para cada mão (Left = +X do modelo, Right = -X) calcula: as juntas dos ossos (pulso, 4 dedos x 2 falanges, polegar x 3) e os pesos de cada vértice.
"""
import math

FINGERS = ['index', 'middle', 'ring', 'pinky']   # do lado do polegar para o lado do mindinho


def smooth(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vmul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def percentile(values, q):
    s = sorted(values)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]


class HandModel:
    """Medidas de uma mão: eixo dos dedos d, pulso, comprimento L, raias dos dedos e zona do polegar."""

    def __init__(self, points, hand_info, side):
        self.side = side
        self.sign = 1 if side == 'Left' else -1
        w, d, L = hand_info['wrist'], hand_info['d'], hand_info['L']
        self.wrist = tuple(w); self.d = (d[0], d[1], 0.0); self.L = L
        # normal da palma (aponta para fora da palma, ou seja, para cima nas costas da mão): perpendicular a d no plano XY
        n = (-self.d[1], self.d[0], 0.0)
        if n[1] < 0:
            n = (-n[0], -n[1], 0.0)
        self.n_back = n
        self.pts = [p for p in points if self.sign * p[0] > 0.3 and -0.1 < self.t(p) < 1.1]
        tips = [p for p in self.pts if self.t(p) > 0.65]
        zs = [p[2] for p in tips]
        self.zf0, self.zf1 = percentile(zs, 0.03), percentile(zs, 0.97)    # raias dos 4 dedos: de zf0 (mindinho) a zf1 (indicador)
        self.lane_w = (self.zf1 - self.zf0) / 4.0
        self.zT = self.zf1 - 0.045                                        # a partir daqui (e perto do pulso) é o polegar
        # linha média da laje da mão (deslocamento perpendicular à palma)
        mid = [vdot(vsub(p, self.wrist), self.n_back) for p in self.pts if 0.35 < self.t(p) < 0.95]
        self.mid_off = sum(mid) / max(1, len(mid))
        # polegar: centroides por faixa de t
        th = [p for p in self.pts if p[2] > self.zT and 0.0 < self.t(p) < 0.6]
        self.thumb_pts = th
        self.thumb_bins = []
        for lo, hi in ((0.0, 0.18), (0.18, 0.34), (0.34, 0.6)):
            b = [p for p in th if lo <= self.t(p) < hi]
            if b:
                self.thumb_bins.append(tuple(sum(p[i] for p in b) / len(b) for i in range(3)))
        # ponta do polegar: ponto de maior t
        self.thumb_tip = max(th, key=self.t) if th else self.wrist

    def t(self, p):
        return vdot(vsub(p, self.wrist), self.d) / self.L

    def at(self, t, z):
        """Ponto da linha média da mão em t (0 = pulso, 1 = ponta) e z lateral."""
        base = vadd(self.wrist, vmul(self.d, t * self.L))
        base = vadd(base, vmul(self.n_back, self.mid_off))
        return (base[0], base[1], z)

    def lane_center(self, k):
        """k = 0 indicador ... 3 mindinho."""
        return self.zf1 - (k + 0.5) * self.lane_w

    # ---- definição dos ossos (cabeça, cauda) em espaço do modelo ----
    def bones(self):
        out = {}
        zc = (self.zf0 + self.zf1) / 2
        out['hand'] = (self.at(0.0, self.wrist[2]), self.at(0.42, zc))
        for k, name in enumerate(FINGERS):
            z = self.lane_center(k)
            out[f'{name}_1'] = (self.at(0.46, z), self.at(0.72, z))
            out[f'{name}_2'] = (self.at(0.72, z), self.at(1.0, z))
        tb = self.thumb_bins
        if len(tb) >= 3:
            j1, j2, j3 = tb[0], tb[1], tb[2]
            tip = self.thumb_tip
            out['thumb_1'] = (j1, j2); out['thumb_2'] = (j2, j3); out['thumb_3'] = (j3, tip)
        return out

    # ---- pesos de um vértice da região da mão (t >= -0.05) ----
    def hand_weights(self, p):
        t = self.t(p); z = p[2]
        w = {}
        # zona do polegar
        zt = smooth(self.zT - 0.008, self.zT + 0.012, z) * (1 - smooth(0.45, 0.58, t)) * smooth(-0.02, 0.08, t)
        if zt > 0.001 and len(self.thumb_bins) >= 3:
            # falanges do polegar ao longo de t
            a = smooth(0.12, 0.24, t); b = smooth(0.3, 0.42, t)
            w['thumb_1'] = zt * (1 - a); w['thumb_2'] = zt * a * (1 - b); w['thumb_3'] = zt * a * b
        rest = 1 - zt
        # dedos: faixa de t >= 0.40
        f = smooth(0.40, 0.52, t)
        if f > 0.001:
            # raias: peso contínuo entre raias vizinhas
            pos = (self.zf1 - z) / self.lane_w - 0.5     # 0 = centro do indicador
            pos = min(3.0, max(0.0, pos))
            k0 = int(math.floor(pos)); k1 = min(3, k0 + 1); fr = pos - k0
            prox = smooth(0.40, 0.52, t) * (1 - smooth(0.68, 0.80, t)); dist = smooth(0.68, 0.80, t)
            for k, kw in ((k0, 1 - fr), (k1, fr)):
                if kw <= 0:
                    continue
                name = FINGERS[k]
                w[f'{name}_1'] = w.get(f'{name}_1', 0) + rest * kw * prox
                w[f'{name}_2'] = w.get(f'{name}_2', 0) + rest * kw * dist
            w['hand'] = w.get('hand', 0) + rest * (1 - f)
        else:
            w['hand'] = w.get('hand', 0) + rest
        return w
