import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *
OUT = K.args()["out"]
sc = setup(960, 540, fast=False, samples=64)
K.world_hdri(f"{HDR}/studio_small_09/studio_small_09_2k.hdr", strength=0.6, bg=(0.15,0.15,0.18))
K.ground(20, K.mat("g",(0.3,0.3,0.3),rough=0.8))
t1 = fir_tree("t1", 2.0, 0.75, (-0.9,0,0), seed=1)
t2 = fir_tree("t2", 2.0, 0.75, (0.9,0,0), seed=2, snow=0.6)
K.stats()
cam = K.camera((0,-6,1.2),(0,0,1.0), lens=40)
K.light("AREA",(-3,-3,4),(0,0,1),power=1500,size=2,k=4500)
K.render(f"{OUT}/tree.png")
