#!/usr/bin/env python3
"""Build the Android WebView APK from the bundled assets and Activity source.
"""
from pathlib import Path
import os, struct, hashlib, zipfile, subprocess, tempfile
ROOT=Path(__file__).resolve().parent
APP_PACKAGE='com.play80.arcade.master.tournamentv41qa'
APP_ACTIVITY=APP_PACKAGE+'.MainActivity'
APK=ROOT.parent/'PLAY80_V4_1_Practice_QA.apk'
NO=0xffffffff

def align(bb, a=4):
    while len(bb)%a: bb.append(0)

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
    content+=start('manifest',[('package',APP_PACKAGE,'s'),('versionCode',int(os.environ.get('PLAY80_VERSION_CODE','44')),'i'),('versionName','5.2','s')])
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

def compile_activity(android_jar, d8):
    with tempfile.TemporaryDirectory() as temp:
        classes_dir = Path(temp)
        source = ROOT / 'android' / 'MainActivity.java'
        subprocess.run(['javac', '--release', '8', '-cp', str(android_jar),
                        '-d', temp, str(source)], check=True)
        classes = sorted(str(path) for path in classes_dir.rglob('*.class'))
        subprocess.run([str(d8), '--lib', str(android_jar), '--min-api', '28',
                        '--output', temp, *classes], check=True)
        return (classes_dir / 'classes.dex').read_bytes()

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    sdk=Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '')
    build_tools=sdk/'build-tools'
    versions=sorted((x for x in build_tools.glob('*') if x.is_dir()),
                    key=lambda x:tuple(int(y) if y.isdecimal() else 0 for y in x.name.split('.')))
    if not versions:
        raise RuntimeError('Android SDK build-tools required for verified APK signing')
    bin_dir=versions[-1]
    platforms = sorted(
        (p for p in (sdk / 'platforms').glob('android-*')
         if p.name[8:].isdigit() and (p / 'android.jar').is_file()),
        key=lambda p: int(p.name[8:]))
    if not platforms:
        raise RuntimeError('An installed Android SDK platform is required')
    android_jar = platforms[-1] / 'android.jar'
    manifest = axml()
    classes = compile_activity(android_jar, bin_dir / 'd8')
    (ROOT/'build').mkdir(exist_ok=True)
    (ROOT/'build'/'classes.dex').write_bytes(classes)
    (ROOT/'build'/'AndroidManifest.xml').write_bytes(manifest)
    un=ROOT/'build'/'unsigned.apk'
    with zipfile.ZipFile(un,'w') as z:
        z.writestr('AndroidManifest.xml',manifest,compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('classes.dex',classes,compress_type=zipfile.ZIP_DEFLATED)
        for f in sorted((ROOT/'assets').iterdir()):
            if not f.is_file():
                continue
            if f.name == 'index.html':
                code = str(int(os.environ.get('PLAY80_VERSION_CODE', '44')))
                page = f.read_text(encoding='utf-8').replace('__PLAY80_BUILD_CODE__', code)
                z.writestr('assets/index.html', page, compress_type=zipfile.ZIP_DEFLATED)
            else:
                z.write(f,'assets/'+f.name,compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('resources.arsc',launcher_resource_table(),compress_type=zipfile.ZIP_STORED)
        z.write(ROOT/'assets'/'play80_app_icon.png','res/drawable/play80_app_icon.png',compress_type=zipfile.ZIP_DEFLATED)
    key=Path(os.environ['PLAY80_SIGNING_KEYSTORE'])
    secret=os.environ['PLAY80_SIGNING_PASSWORD']
    if not key.is_file():raise RuntimeError('The original play80 Master signing key must be supplied for every update')
    # Android 7+ supports APK Signature Scheme v2; avoid legacy jarsigner-only (v1)
    # release files. Align first, sign last, and verify using Android SDK tools.
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
