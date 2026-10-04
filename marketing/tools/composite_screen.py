import cv2, numpy as np, sys, json
SP=sys.argv[1]
C={int(k):np.float32(v) for k,v in json.load(open(f"{SP}/corners.json")).items()}
shot=cv2.imread(f"{SP}/screen_vi.png")
W,H=1080,2340
tex=np.full((H,W,3),(30,10,15),np.uint8)
s=cv2.resize(shot,(W,H),interpolation=cv2.INTER_AREA)
tex=s
mask=np.zeros((H,W),np.uint8); r=110
cv2.rectangle(mask,(r,0),(W-r,H),255,-1); cv2.rectangle(mask,(0,r),(W,H-r),255,-1)
for cx,cy in [(r,r),(W-r,r),(r,H-r),(W-r,H-r)]: cv2.circle(mask,(cx,cy),r,255,-1)
src=np.float32([[0,0],[W,0],[W,H],[0,H]])
import os; os.makedirs(f"{SP}/out",exist_ok=True)
for i in range(1,145):
    fr=cv2.imread(f"{SP}/fr/{i:04d}.png")
    if i in C:
        Hm=cv2.getPerspectiveTransform(src,C[i])
        w=cv2.warpPerspective(tex,Hm,(fr.shape[1],fr.shape[0]),flags=cv2.INTER_AREA)
        m=cv2.warpPerspective(mask,Hm,(fr.shape[1],fr.shape[0]),flags=cv2.INTER_LINEAR).astype(np.float32)/255
        w=cv2.GaussianBlur(w,(3,3),0.8)
        w=cv2.convertScaleAbs(w,alpha=1.05,beta=4)
        m=cv2.GaussianBlur(m,(3,3),0.7)[...,None]
        fr=(fr*(1-m)+w*m).astype(np.uint8)
    cv2.imwrite(f"{SP}/out/{i:04d}.png",fr)
