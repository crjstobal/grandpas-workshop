import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_interior import *
from gw_pip import pip
A = K.args(); OUT = A["out"]
poses = A.get("poses", "sleep,awake,cold").split(",")
sc = setup(400 * len(poses), 500, samples=96)
K.world_hdri(f"{HDR}/christmas_photo_studio_01/christmas_photo_studio_01_2k.hdr", strength=0.6, bg=(0.12, 0.1, 0.09))
K.ground(5, K.mat("g", (0.25, 0.2, 0.17), rough=0.8))
for i, pose in enumerate(poses):
    x = (i - (len(poses) - 1) / 2) * 0.26
    pr, bar = perch(f"perch{i}", (x, 0, 0))
    pip(f"pip_{pose}", pose, tuple(bar), rot_z=math.radians(float(A.get("rz", -30))))
cam = K.camera((0.0, -1.1 - 0.25 * len(poses), 0.3), (0, 0, 0.2), lens=60)
K.light("AREA", (-0.5, -0.6, 0.8), (0, 0, 0.15), power=40, size=0.5, k=3000)
K.light("AREA", (0.6, 0.3, 0.4), (0, 0, 0.15), power=15, size=0.4, k=8000)
K.render(f"{OUT}/pip_test.png")
