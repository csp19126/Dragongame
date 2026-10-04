import cv2, numpy as np, sys, json
SP=sys.argv[1]
REF=70
ref_c=np.float32([[259,601],[370,600],[369,840],[257,840]])
sift=cv2.SIFT_create(nfeatures=4000)
def gray(i): return cv2.cvtColor(cv2.imread(f"{SP}/fr/{i:04d}.png"),cv2.COLOR_BGR2GRAY)
res={REF:ref_c.tolist()}
bf=cv2.BFMatcher()
def track(seq):
    prev=REF; prev_c=ref_c
    for i in seq:
        g0=gray(prev); g1=gray(i)
        m0=np.zeros_like(g0); cv2.fillConvexPoly(m0,prev_c.astype(np.int32),255)
        c=prev_c.mean(0); m1=np.zeros_like(g1)
        r=int(max(np.ptp(prev_c[:,0]),np.ptp(prev_c[:,1]))*0.9)
        cv2.rectangle(m1,(int(c[0]-r),int(c[1]-r)),(int(c[0]+r),int(c[1]+r)),255,-1)
        k0,d0=sift.detectAndCompute(g0,m0); k1,d1=sift.detectAndCompute(g1,m1)
        if d0 is None or d1 is None or len(k0)<8 or len(k1)<8: print(i,"few kp"); break
        ms=[m for m,n in bf.knnMatch(d0,d1,k=2) if m.distance<0.75*n.distance]
        if len(ms)<8: print(i,"few matches",len(ms)); break
        p0=np.float32([k0[m.queryIdx].pt for m in ms]); p1=np.float32([k1[m.trainIdx].pt for m in ms])
        H,inl=cv2.findHomography(p0,p1,cv2.RANSAC,3.0)
        if H is None or inl.sum()<8: print(i,"bad H"); break
        cc=cv2.perspectiveTransform(prev_c[None],H)[0]
        res[i]=cc.tolist(); print(i,int(inl.sum()),np.round(cc).astype(int).tolist())
        prev, prev_c = i, cc
track(range(REF+1,94)); track(range(REF-1,30,-1))
json.dump(res,open(f"{SP}/corners.json","w"))
