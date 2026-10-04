import cv2, numpy as np, sys, json, os
SP=sys.argv[1]
C={int(k):np.float32(v) for k,v in json.load(open(f"{SP}/corners_w.json")).items()}
ks=sorted(C); A=np.stack([C[k] for k in ks])          # (n,4,2)
from numpy.lib.stride_tricks import sliding_window_view
pad=np.pad(A,((2,2),(0,0),(0,0)),mode='edge')
med=np.median(sliding_window_view(pad,5,axis=0),axis=-1)   # median of 5 frames
pad2=np.pad(med,((1,1),(0,0),(0,0)),mode='edge')
sm=(pad2[:-2]+pad2[1:-1]+pad2[2:])/3
C={k:((sm[j]-sm[j].mean(0))*np.float32([1.035,1.03])+sm[j].mean(0)).astype(np.float32) for j,k in enumerate(ks)}
shot=cv2.imread(f"{SP}/screen_vi.png"); W,H=1080,2340
tex=cv2.resize(shot,(W,H),interpolation=cv2.INTER_AREA)
mask=np.zeros((H,W),np.uint8); r=110
cv2.rectangle(mask,(r,0),(W-r,H),255,-1); cv2.rectangle(mask,(0,r),(W,H-r),255,-1)
for cx,cy in [(r,r),(W-r,r),(r,H-r),(W-r,H-r)]: cv2.circle(mask,(cx,cy),r,255,-1)
src=np.float32([[0,0],[W,0],[W,H],[0,H]])
os.makedirs(f"{SP}/wo",exist_ok=True)
for i in range(2,58):
    fr=cv2.imread(f"{SP}/wu/{i:04d}.png")
    Hm=cv2.getPerspectiveTransform(src,C[i])
    w=cv2.warpPerspective(tex,Hm,(fr.shape[1],fr.shape[0]),flags=cv2.INTER_AREA)
    m=cv2.warpPerspective(mask,Hm,(fr.shape[1],fr.shape[0])).astype(np.float32)/255
    w=cv2.GaussianBlur(w,(3,3),0.7); m=cv2.GaussianBlur(m,(5,5),1.0)[...,None]
    fr=(fr*(1-m)+w*m).astype(np.uint8)
    cv2.imwrite(f"{SP}/wo/{i-1:04d}.png",fr)
