#!/usr/bin/env python3
"""Build a minimal offline Android WebView APK from source files without Android SDK.
App content resides in assets/index.html. Minimal classes.dex is generated from
Dalvik bytecode; the manifest is generated as compiled binary Android XML.
"""
from pathlib import Path
import os, struct, hashlib, zlib, zipfile, subprocess, shutil
ROOT=Path(__file__).resolve().parent
APP_PACKAGE='com.play80.arcade.master.tournamentv41qa'
APP_ACTIVITY=APP_PACKAGE+'.MainActivity'
APK=ROOT.parent/'PLAY80_V4_1_Practice_QA.apk'
NO=0xffffffff

def align(bb, a=4):
    while len(bb)%a: bb.append(0)

def uleb(v):
    v=int(v); result=bytearray()
    while True:
        b=v&0x7f; v>>=7
        if v: result.append(b|0x80)
        else: result.append(b);return bytes(result)

def strdata(s):
    encoded=s.encode('utf8')
    return uleb(len(s.encode('utf-16le'))//2)+encoded+b'\x00'

def axml():
    android_uri='http://schemas.android.com/apk/res/android'
    sset={
        'android',android_uri,'manifest','package',APP_PACKAGE,'versionCode','versionName','5.2',
        'uses-sdk','uses-permission','android.permission.INTERNET','minSdkVersion','targetSdkVersion','application','label','play80',
        'hasCode','icon','activity','name',APP_ACTIVITY,'exported','intent-filter','action',
        'android.intent.action.MAIN','category','android.intent.category.LAUNCHER'
    }
    strings=sorted(sset)
    idx={s:i for i,s in enumerate(strings)}
    resource_ids={
        'versionCode':0x0101021b,'versionName':0x0101021c,'minSdkVersion':0x0101020c,
        'targetSdkVersion':0x01010270,'label':0x01010001,'icon':0x01010002,'hasCode':0x0101000c,
        'name':0x01010003,'exported':0x01010010
    }
    offsets=[]; data=bytearray()
    for s in strings:
        offsets.append(len(data)); e=s.encode('utf8')
        def len8(n):return bytes([n]) if n<=127 else bytes([(n>>8)|0x80,n&255])
        data+=len8(len(s.encode('utf-16le'))//2)+len8(len(e))+e+b'\x00'
    off=28+4*len(strings)
    pool=bytearray(struct.pack('<HHI',0x0001,28,0))
    pool+=struct.pack('<IIIII',len(strings),0,0x100,off,0)
    pool+=struct.pack('<'+'I'*len(offsets),*offsets)
    pool+=data;align(pool)
    struct.pack_into('<I',pool,4,len(pool))
    resource_map=bytearray(struct.pack('<HHI',0x0180,8,8+4*len(strings)))
    for s in strings:resource_map+=struct.pack('<I',resource_ids.get(s,0))
    def chunk(kind,extension=b'',header_size=16, lineno=1):
        b=bytearray(struct.pack('<HHI',kind,header_size,header_size+len(extension)))
        b+=struct.pack('<II',lineno,NO)
        b+=extension
        return b
    def start_ns():return chunk(0x0100,struct.pack('<II',idx['android'],idx[android_uri]))
    def end_ns():return chunk(0x0101,struct.pack('<II',idx['android'],idx[android_uri]))
    def start(tag,attrs=()):
        ext=struct.pack('<IIHHHHHH',NO,idx[tag],20,20,len(attrs),0,0,0)
        blob=bytearray()
        for name,value,kind in attrs:
            ns=NO if name=='package' else idx[android_uri]
            resname=idx[name]
            if kind=='s':raw=data_value=idx[value];dt=0x03
            elif kind=='i':raw=NO;data_value=value;dt=0x10
            elif kind=='b':raw=NO;data_value=0xffffffff if value else 0;dt=0x12
            elif kind=='r':raw=NO;data_value=value;dt=0x01
            else:raise ValueError(kind)
            blob+=struct.pack('<IIIHBBI',ns,resname,raw,8,0,dt,data_value)
        return chunk(0x0102,ext+blob)
    def end(tag):return chunk(0x0103,struct.pack('<II',NO,idx[tag]))
    content=bytearray()
    content+=start_ns()
    content+=start('manifest',[('package',APP_PACKAGE,'s'),('versionCode',43,'i'),('versionName','5.2','s')])
    content+=start('uses-sdk',[('minSdkVersion',23,'i'),('targetSdkVersion',28,'i')]);content+=end('uses-sdk')
    content+=start('uses-permission',[('name','android.permission.INTERNET','s')]);content+=end('uses-permission')
    content+=start('application',[('label','play80','s'),('icon',0x7f010000,'r'),('hasCode',True,'b')])
    content+=start('activity',[('name',APP_ACTIVITY,'s'),('exported',True,'b')])
    content+=start('intent-filter')
    content+=start('action',[('name','android.intent.action.MAIN','s')]);content+=end('action')
    content+=start('category',[('name','android.intent.category.LAUNCHER','s')]);content+=end('category')
    content+=end('intent-filter')
    content+=end('activity')
    content+=end('application')
    content+=end('manifest')
    content+=end_ns()
    return struct.pack('<HHI',0x0003,8,8+len(pool)+len(resource_map)+len(content))+pool+resource_map+content

def launcher_resource_table():
    """Minimal Android resource table with drawable/play80_icon (id=0x7f010000)."""
    def align4(data):
        return data + b'\x00' * ((-len(data)) % 4)
    def pool(strings):
        # UTF-8 Android ResStringPool entries with length encoding.
        def len8(v):
            return bytes([v]) if v <= 127 else bytes([(v >> 8) | 0x80, v & 255])
        encoded=[]; offsets=[]; offset=0
        for item in strings:
            bb=item.encode('utf8'); n=len(item.encode('utf-16le'))//2
            v=len8(n)+len8(len(bb))+bb+b'\x00'
            offsets.append(offset);encoded.append(v);offset+=len(v)
        strings_blob=align4(b''.join(encoded))
        start=28+len(strings)*4
        size=start+len(strings_blob)
        header=struct.pack('<HHI',0x0001,28,size)+struct.pack('<IIIII',len(strings),0,0x100,start,0)
        return header+struct.pack('<'+'I'*len(strings),*offsets)+strings_blob
    full=pool(['res/drawable/play80_app_icon.png'])
    type_pool=pool(['drawable'])
    key_pool=pool(['play80_app_icon'])
    # ResTable_package header: size 288 includes typeIdOffset (0).
    pkg_hdr=bytearray(288)
    struct.pack_into('<HHI',pkg_hdr,0,0x0200,288,0)
    struct.pack_into('<I',pkg_hdr,8,0x7f)
    name=APP_PACKAGE.encode('utf-16le')
    pkg_hdr[12:12+len(name)]=name
    struct.pack_into('<IIIII',pkg_hdr,268,288,1,288+len(type_pool),1,0)
    # One public drawable resource.
    spec=struct.pack('<HHI',0x0202,16,20)+struct.pack('<BBHI',1,0,0,1)+struct.pack('<I',0x40000000)
    config=struct.pack('<I',64)+bytes(60)
    typ_hdr=struct.pack('<HHI',0x0201,84,84+4+16)+struct.pack('<BBHII',1,0,0,1,88)+config
    entry=struct.pack('<HHI',8,0,0)+struct.pack('<HBBI',8,0,0x03,0)
    typ=typ_hdr+struct.pack('<I',0)+entry
    pkg=bytes(pkg_hdr)+type_pool+key_pool+spec+typ
    pkg=bytearray(pkg)
    struct.pack_into('<I',pkg,4,len(pkg))
    table=struct.pack('<HHII',0x0002,12,12+len(full)+len(pkg),1)+full+pkg
    return table

def dex():
    cls='L'+APP_PACKAGE.replace('.','/')+'/MainActivity;'
    ACT='Landroid/app/Activity;'; BUNDLE='Landroid/os/Bundle;'; CONTEXT='Landroid/content/Context;'
    WVIEW='Landroid/webkit/WebView;'; WSET='Landroid/webkit/WebSettings;'; WCLIENT='Landroid/webkit/WebViewClient;'
    VIEW='Landroid/view/View;';STRING='Ljava/lang/String;';V='V';Z='Z'
    types=[cls,ACT,BUNDLE,CONTEXT,WVIEW,WSET,WCLIENT,VIEW,STRING,V,Z]
    methods=[
        (ACT,'<init>',V,()),(ACT,'onCreate',V,(BUNDLE,)),(ACT,'setContentView',V,(VIEW,)),
        (WVIEW,'<init>',V,(CONTEXT,)),(WVIEW,'getSettings',WSET,()),(WVIEW,'setWebViewClient',V,(WCLIENT,)),(WVIEW,'loadUrl',V,(STRING,)),
        (WSET,'setJavaScriptEnabled',V,(Z,)),(WSET,'setDomStorageEnabled',V,(Z,)),
        (WCLIENT,'<init>',V,()),(cls,'<init>',V,()),(cls,'onCreate',V,(BUNDLE,)),(cls,'onBackPressed',V,())
    ]
    shorty=lambda d: 'L' if d[0] in '[L' else d
    protos=sorted({(m[2],m[3]) for m in methods},key=lambda p:p)
    all_strings={s for s in types}
    all_strings.update(m[1] for m in methods)
    all_strings.add('file:///android_asset/index.html')
    all_strings.add('javascript:window.play80NativeBack()')
    all_strings.add('webView')
    all_strings.update(shorty(ret)+''.join(map(shorty,params)) for ret,params in protos)
    strings=sorted(all_strings)
    si={s:i for i,s in enumerate(strings)}
    typeids=sorted(set(types),key=lambda s:si[s]);ti={t:i for i,t in enumerate(typeids)}
    protos=sorted(protos,key=lambda p:(ti[p[0]],tuple(ti[t] for t in p[1])))
    pi={p:i for i,p in enumerate(protos)}
    methods=sorted(methods,key=lambda m:(ti[m[0]],si[m[1]],pi[(m[2],m[3])]))
    mi={(m[0],m[1],m[2],m[3]):i for i,m in enumerate(methods)}
    FIELD_ID=0
    def method(c,n,r=V,p=()):return mi[(c,n,r,tuple(p))]
    b=bytearray(b'\x00'*112)
    def tab(block,sz):
        align(b,4);off=len(b)
        b.extend(b'\x00'*block*sz)
        return off
    string_ids_off=tab(len(strings),4)
    type_ids_off=tab(len(typeids),4)
    proto_ids_off=tab(len(protos),12)
    field_ids_off=tab(1,8)
    method_ids_off=tab(len(methods),8)
    class_defs_off=tab(1,32)
    data_off=len(b)
    type_list_offsets={}
    for p in protos:
        if not p[1]:continue
        params=p[1]
        if params in type_list_offsets:continue
        align(b);type_list_offsets[params]=len(b)
        b+=struct.pack('<I',len(params))
        for t in params:b+=struct.pack('<H',ti[t])
        align(b)
    string_data_off=len(b)
    str_off=[]
    for s in strings:str_off.append(len(b));b+=strdata(s)
    align(b)
    code_off=len(b)
    def inv(op,ref,regs):
        if len(regs)>5 or any(r>15 for r in regs):raise RuntimeError('bad regs')
        reg=regs+[0]*(5-len(regs))
        return [op|(len(regs)<<12)|(reg[4]<<8),ref,reg[0]|(reg[1]<<4)|(reg[2]<<8)|(reg[3]<<12)]
    def new(reg,t):return [0x22|(reg<<8),ti[t]]
    def move_result_obj(reg):return [0x0c|(reg<<8)]
    def const4(reg,value):return [0x12|(reg<<8)|((value&15)<<12)]
    def const_string(reg,value):return [0x1a|(reg<<8),si[value]]
    constructor=inv(0x70,method(ACT,'<init>'),[0])+[0x0e]
    oncreate=[]
    oncreate+=inv(0x6f,method(ACT,'onCreate',p=(BUNDLE,)),[3,4])
    oncreate+=new(0,WVIEW)
    oncreate+=inv(0x70,method(WVIEW,'<init>',p=(CONTEXT,)),[0,3])
    # Store the WebView on the activity instance: iput-object v0, v3, webView.
    oncreate += [0x5b | (3<<12), FIELD_ID]
    oncreate+=inv(0x6e,method(WVIEW,'getSettings',r=WSET),[0])
    oncreate+=move_result_obj(1)
    oncreate+=const4(2,1)
    oncreate+=inv(0x6e,method(WSET,'setJavaScriptEnabled',p=(Z,)),[1,2])
    oncreate+=inv(0x6e,method(WSET,'setDomStorageEnabled',p=(Z,)),[1,2])
    oncreate+=new(1,WCLIENT)
    oncreate+=inv(0x70,method(WCLIENT,'<init>'),[1])
    oncreate+=inv(0x6e,method(WVIEW,'setWebViewClient',p=(WCLIENT,)),[0,1])
    oncreate+=const_string(1,'file:///android_asset/index.html')
    oncreate+=inv(0x6e,method(WVIEW,'loadUrl',p=(STRING,)),[0,1])
    oncreate+=inv(0x6e,method(ACT,'setContentView',p=(VIEW,)),[3,0])
    oncreate+=[0x0e]
    # Native Android hardware Back button forwards to in-page navigation.
    onback=[0x54 | (2<<12),FIELD_ID]  # iget-object v0, v2, this.webView
    onback+=const_string(1,'javascript:window.play80NativeBack()')
    onback+=inv(0x6e,method(WVIEW,'loadUrl',p=(STRING,)),[0,1])
    onback+=[0x0e]
    codes={}
    for n,(regs,ins,outs,words) in [('ctor',(1,1,1,constructor)),('onCreate',(5,2,2,oncreate)),('onBackPressed',(3,1,2,onback))]:
        align(b);codes[n]=len(b)
        b+=struct.pack('<HHHHII',regs,ins,outs,0,0,len(words))
        b+=struct.pack('<'+'H'*len(words),*words)
    class_data_off=len(b)
    class_data=uleb(0)+uleb(1)+uleb(1)+uleb(2)
    class_data+=uleb(FIELD_ID)+uleb(0x2) # private WebView field
    class_data+=uleb(method(cls,'<init>'))+uleb(0x10001)+uleb(codes['ctor'])
    virtuals=sorted([(method(cls,'onCreate',p=(BUNDLE,)),0x4,codes['onCreate']),
                     (method(cls,'onBackPressed'),0x1,codes['onBackPressed'])],key=lambda a:a[0])
    prev=0
    for m,flags,addr in virtuals:
        class_data+=uleb(m-prev)+uleb(flags)+uleb(addr);prev=m
    b+=class_data
    align(b)
    map_off=len(b)
    # We have no fields. The map contains only sections present in this dex.
    items=[
        (0x0000,1,0),(0x0001,len(strings),string_ids_off),
        (0x0002,len(typeids),type_ids_off),(0x0003,len(protos),proto_ids_off),
        (0x0004,1,field_ids_off),(0x0005,len(methods),method_ids_off),(0x0006,1,class_defs_off),
        (0x1001,len(type_list_offsets),data_off),(0x2002,len(strings),string_data_off),
        (0x2001,3,code_off),(0x2000,1,class_data_off),(0x1000,1,map_off)
    ]
    items.sort(key=lambda item:item[2]);b+=struct.pack('<I',len(items))
    for typ,count,off in items:b+=struct.pack('<HHII',typ,0,count,off)
    for i,off in enumerate(str_off):struct.pack_into('<I',b,string_ids_off+i*4,off)
    for i,t in enumerate(typeids):struct.pack_into('<I',b,type_ids_off+i*4,si[t])
    for i,(ret,params) in enumerate(protos):
        short=shorty(ret)+''.join(shorty(x) for x in params)
        struct.pack_into('<III',b,proto_ids_off+i*12,si[short],ti[ret],type_list_offsets.get(params,0))
    struct.pack_into('<HHI',b,field_ids_off,ti[cls],ti[WVIEW],si['webView'])
    for i,(c,n,ret,params) in enumerate(methods):struct.pack_into('<HHI',b,method_ids_off+i*8,ti[c],pi[(ret,params)],si[n])
    struct.pack_into('<IIIIIIII',b,class_defs_off,ti[cls],0x1,ti[ACT],0,NO,0,class_data_off,0)
    header_vals=[len(b),112,0x12345678,0,0,map_off,len(strings),string_ids_off,len(typeids),type_ids_off,len(protos),proto_ids_off,1,field_ids_off,len(methods),method_ids_off,1,class_defs_off,len(b)-data_off,data_off]
    b[:8]=b'dex\n035\x00'
    struct.pack_into('<'+'I'*20,b,32,*header_vals)
    b[12:32]=hashlib.sha1(b[32:]).digest()
    struct.pack_into('<I',b,8,zlib.adler32(b[12:])&0xffffffff)
    return bytes(b)

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    manifest=axml(); classes=dex()
    (ROOT/'build').mkdir(exist_ok=True)
    (ROOT/'build'/'classes.dex').write_bytes(classes)
    (ROOT/'build'/'AndroidManifest.xml').write_bytes(manifest)
    un=ROOT/'build'/'unsigned.apk'
    with zipfile.ZipFile(un,'w') as z:
        z.writestr('AndroidManifest.xml',manifest,compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('classes.dex',classes,compress_type=zipfile.ZIP_DEFLATED)
        for f in sorted((ROOT/'assets').iterdir()):
            if f.is_file():z.write(f,'assets/'+f.name,compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('resources.arsc',launcher_resource_table(),compress_type=zipfile.ZIP_STORED)
        z.write(ROOT/'assets'/'play80_app_icon.png','res/drawable/play80_app_icon.png',compress_type=zipfile.ZIP_DEFLATED)
    key=Path(os.environ['PLAY80_SIGNING_KEYSTORE'])
    secret=os.environ['PLAY80_SIGNING_PASSWORD']
    if not key.is_file():raise RuntimeError('The original play80 Master signing key must be supplied for every update')
    # Android 7+ supports APK Signature Scheme v2; avoid legacy jarsigner-only (v1)
    # release files. Align first, sign last, and verify using Android SDK tools.
    sdk=Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '')
    build_tools=sdk/'build-tools'
    versions=sorted((x for x in build_tools.glob('*') if x.is_dir()),
                    key=lambda x:tuple(int(y) if y.isdecimal() else 0 for y in x.name.split('.')))
    if not versions:
        raise RuntimeError('Android SDK build-tools required for verified APK signing')
    bin_dir=versions[-1]
    align_tool=bin_dir/'zipalign'
    signer=bin_dir/'apksigner'
    if not align_tool.is_file() or not signer.is_file():
        raise RuntimeError('Android SDK zipalign and apksigner are required; no unsafe jarsigner fallback')
    aligned=ROOT/'build'/'aligned.apk'
    subprocess.run([str(align_tool),'-f','4',str(un),str(aligned)],check=True)
    subprocess.run([str(signer),'sign','--ks',str(key),'--ks-key-alias','play80',
                    '--ks-pass','pass:'+secret,'--key-pass','pass:'+secret,
                    '--v1-signing-enabled','true','--v2-signing-enabled','true',
                    '--v3-signing-enabled','true','--out',str(APK),str(aligned)],check=True)
    subprocess.run([str(signer),'verify','--verbose','--min-sdk-version','28',str(APK)],check=True)
    print('APK:',APK,'bytes:',APK.stat().st_size)
    print('DEX bytes',len(classes),'AXML bytes',len(manifest))
    print('sha256:',hashlib.sha256(APK.read_bytes()).hexdigest())

if __name__=='__main__':main()
