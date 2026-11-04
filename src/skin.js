import { createSkinMesh, boneMatrices, skinVertex, SOURCE_RIGS, JOINT_NAMES, partContains } from './rig.js';

export const SKIN_SURFACE = { width:800,height:720,x:400,y:640 };
const PART_CODE={body:0,N:1,F:2,head:3,full:4};
export class OriginalSkin {
  constructor(image,id,{forceCanvas=false,layer=null}={}) {
    this.image=image;this.id=id;this.shared=Boolean(layer);this.canvas=layer?.canvas||document.createElement('canvas');
    if(!layer){this.canvas.width=SKIN_SURFACE.width;this.canvas.height=SKIN_SURFACE.height;}
    this.gl=layer?.gl||(forceCanvas?null:this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true}));
    const cells=this.gl?56:24;
    this.meshes=Array.from({length:8},(_,frame)=>createSkinMesh(id,frame,cells));
    this.headMeshes=Array.from({length:8},(_,frame)=>createSkinMesh(id,frame,1,'head'));
    this.parts=Object.fromEntries(['F','N','body'].map(part=>[part,createSkinMesh(id,0,this.gl?42:16,part)]));
    this.channelMeshes=new Map();this.gpuBuffers=new Map();this.partTextures=new Map();
    if(this.gl)this.initializeGL();
    else{this.canvas=document.createElement('canvas');this.canvas.width=SKIN_SURFACE.width;this.canvas.height=SKIN_SURFACE.height;this.ctx=this.canvas.getContext('2d');}
  }
  initializeGL(){
    const gl=this.gl;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    const vertex=compile(gl.VERTEX_SHADER,`attribute vec2 aPosition;attribute vec2 aUV;attribute vec2 aWorld;uniform mat3 uView;varying vec2 vUV;varying vec2 vSource;void main(){vec3 projected=uView*vec3(aWorld,1.0);gl_Position=vec4(projected.xy,0.0,1.0);vUV=aUV;vSource=aPosition;}`);
    const fragment=compile(gl.FRAGMENT_SHADER,`precision highp float;uniform sampler2D uImage;uniform vec2 uRig[19];uniform int uPart;uniform int uFrame;uniform float uFemale;uniform float uOpacity;varying vec2 vUV;varying vec2 vSource;
    float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.0,1.0);return length(p-a-d*t);}
    void main(){vec4 color=texture2D(uImage,vUV);vec2 p=vSource;vec2 h=uRig[2];vec2 n=uRig[1];
      bool head=p.x>=(uFemale>.5?min(h.x,n.x)-76.0:h.x-52.0)&&p.x<=max(h.x,n.x)+54.0&&p.y>=h.y-75.0&&p.y<=n.y-4.0;
      if(head&&p.y>h.y+8.0){float t=clamp((p.y-h.y-8.0)/(n.y-4.0-h.y-8.0),0.0,1.0);if(abs(p.x-mix(h.x,n.x,t))>mix(uFemale>.5?55.0:44.0,16.0,t))head=false;}
      if(head&&p.y>h.y+15.0&&min(segmentDistance(p,uRig[5],uRig[6]),segmentDistance(p,uRig[9],uRig[10]))<13.0)head=false;
      if(uPart==3){if(!head)discard;}else{
        if(head)discard;
        if(uPart==0){bool belt=uFemale<.5&&color.r>color.g*1.35&&color.r>color.b*1.1&&p.y<uRig[0].y+93.0&&p.x>uRig[15].x+12.0&&p.x<uRig[11].x+42.0;float hem=uRig[0].y+(uFemale<.5&&uFrame==3?-8.0:24.0);if(p.y>=hem&&!belt)discard;}
        if(uPart==1||uPart==2){if(p.y<uRig[0].y-18.0)discard;
          float split=(uRig[11].x+uRig[15].x)*.5;
          if(uPart==1&&p.x<split)discard;if(uPart==2&&p.x>=split)discard;
        }
      }
      if(color.a<.001)discard;gl_FragColor=color*uOpacity;
    }`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);this.program=program;
    this.attributes=['aPosition','aUV','aWorld'].map(x=>gl.getAttribLocation(program,x));
    this.viewUniform=gl.getUniformLocation(program,'uView');this.opacityUniform=gl.getUniformLocation(program,'uOpacity');
    this.rigUniform=gl.getUniformLocation(program,'uRig[0]');this.partUniform=gl.getUniformLocation(program,'uPart');this.frameUniform=gl.getUniformLocation(program,'uFrame');
    gl.uniform1f(gl.getUniformLocation(program,'uFemale'),this.id==='lieying'?1:0);
    const texture=gl.createTexture();this.texture=texture;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);if(!this.shared)gl.viewport(0,0,800,720);
  }
  passes(pose){
    if(pose.channels)return pose.channels.map(channel=>{
      const {frame,part}=channel,key=frame+':'+part;
      let mesh=part==='head'?this.headMeshes[frame]:part==='full'?this.meshes[frame]:frame===0?this.parts[part]:this.channelMeshes.get(key);
      if(!mesh){mesh=createSkinMesh(this.id,frame,this.gl?42:16,part);this.channelMeshes.set(key,mesh);}
      return {...channel,mesh};
    });
    const frame=pose.attachment??pose.frames[0].frame;
    return pose.layered?[{frame:0,part:'F',mesh:this.parts.F},{frame:0,part:'N',mesh:this.parts.N},{frame:0,part:'body',mesh:this.parts.body},{frame:0,part:'head',mesh:this.headMeshes[0]}]:[{frame,part:'full',mesh:this.meshes[frame]},{frame,part:'head',mesh:this.headMeshes[frame]}];
  }
  bufferFor(mesh){
    if(!this.gpuBuffers.has(mesh)){
      const gl=this.gl,v=gl.createBuffer(),i=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);const dynamic=gl.createBuffer(),positions=new Float32Array(mesh.vertices.length/6);gl.bindBuffer(gl.ARRAY_BUFFER,dynamic);gl.bufferData(gl.ARRAY_BUFFER,positions.byteLength,gl.DYNAMIC_DRAW);this.gpuBuffers.set(mesh,{v,i,dynamic,positions,count:mesh.indices.length,lastPose:null});
    }
    return this.gpuBuffers.get(mesh);
  }
  render(pose){
    if(this.gl){
      const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawGPU(pose,new Float32Array([1/400,0,0,0,-1/360,0,0,1-640/360,1]),1);
    }else this.renderCanvas(pose);
    return pose;
  }
  drawGPU(pose,view,opacity=1){
    const gl=this.gl;gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniformMatrix3fv(this.viewUniform,false,view);gl.uniform1f(this.opacityUniform,opacity);
    if(this.lastPose!==pose){this.lastPose=pose;this.poseMatrices=new Map();}
    let lastFrame=-1;
    for(const {frame,part,mesh,joints=pose.joints} of this.passes(pose)){
      const matrixKey=frame+':'+part;
      if(!this.poseMatrices.has(matrixKey))this.poseMatrices.set(matrixKey,boneMatrices(this.id,frame,joints));
      if(frame!==lastFrame){
        gl.uniform1i(this.frameUniform,frame);
        gl.uniform2fv(this.rigUniform,new Float32Array(JOINT_NAMES.flatMap(key=>[SOURCE_RIGS[this.id][frame][key].x,SOURCE_RIGS[this.id][frame][key].y])));lastFrame=frame;
      }
      gl.uniform1i(this.partUniform,PART_CODE[part]);
      const buffer=this.bufferFor(mesh);
      if(buffer.lastPose!==pose){
        const source=mesh.vertices,matrices=this.poseMatrices.get(matrixKey),output=buffer.positions;
        for(let k=0,n=0;k<source.length;k+=12,n+=2){
          let x=0,y=0;const px=source[k],py=source[k+1];
          for(let j=0;j<4;j++){const weight=source[k+8+j];if(weight===0)continue;const m=matrices[source[k+4+j]];x+=(m[0]*px+m[2]*py+m[4])*weight;y+=(m[1]*px+m[3]*py+m[5])*weight;}
          output[n]=x;output[n+1]=y;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer.dynamic);gl.bufferSubData(gl.ARRAY_BUFFER,0,output);buffer.lastPose=pose;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer.i);gl.bindBuffer(gl.ARRAY_BUFFER,buffer.v);
      for(let i=0;i<2;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],2,gl.FLOAT,false,48,i*8);}
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer.dynamic);gl.enableVertexAttribArray(this.attributes[2]);gl.vertexAttribPointer(this.attributes[2],2,gl.FLOAT,false,0,0);
      gl.drawElements(gl.TRIANGLES,buffer.count,gl.UNSIGNED_SHORT,0);
    }
  }
  textureFor(frame,part){
    const key=frame+':'+part;
    if(!this.partTextures.has(key)){
      const canvas=document.createElement('canvas');canvas.width=448;canvas.height=448;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(this.image,frame%4*this.image.width/4,Math.floor(frame/4)*this.image.height/2,this.image.width/4,this.image.height/2,0,0,448,448);
      const image=ctx.getImageData(0,0,448,448);
      for(let y=0;y<448;y++)for(let x=0;x<448;x++)if(image.data[(y*448+x)*4+3]&&!partContains(this.id,frame,{x:x+.5,y:y+.5},part==='full'?null:part,[image.data[(y*448+x)*4],image.data[(y*448+x)*4+1],image.data[(y*448+x)*4+2]]))image.data[(y*448+x)*4+3]=0;
      ctx.putImageData(image,0,0);this.partTextures.set(key,canvas);
    }
    return this.partTextures.get(key);
  }
  renderCanvas(pose){
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,800,720);c.globalCompositeOperation='source-over';
    for(const {frame,part,mesh,joints=pose.joints} of this.passes(pose)){
      const matrices=boneMatrices(this.id,frame,joints),v=mesh.vertices,texture=this.textureFor(frame,part);
      const mapped=Array.from({length:v.length/12},(_,i)=>{const k=i*12;return skinVertex(v[k],v[k+1],[...v.slice(k+4,k+8)],[...v.slice(k+8,k+12)],matrices);});
      for(let i=0;i<mesh.indices.length;i+=3){
        const ids=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]],s=ids.map(n=>({x:v[n*12],y:v[n*12+1]})),d=ids.map(n=>({x:mapped[n].x+400,y:mapped[n].y+640}));
        const sx1=s[1].x-s[0].x,sy1=s[1].y-s[0].y,sx2=s[2].x-s[0].x,sy2=s[2].y-s[0].y,det=sx1*sy2-sx2*sy1;
        const dx1=d[1].x-d[0].x,dy1=d[1].y-d[0].y,dx2=d[2].x-d[0].x,dy2=d[2].y-d[0].y;
        const a=(dx1*sy2-dx2*sy1)/det,b=(dy1*sy2-dy2*sy1)/det,cc=(dx2*sx1-dx1*sx2)/det,e=(dy2*sx1-dy1*sx2)/det;
        const center={x:(d[0].x+d[1].x+d[2].x)/3,y:(d[0].y+d[1].y+d[2].y)/3};
        const clip=d.map(p=>{const size=Math.hypot(p.x-center.x,p.y-center.y),q=1+.55/Math.max(1,size);return {x:center.x+(p.x-center.x)*q,y:center.y+(p.y-center.y)*q};});
        c.save();c.beginPath();c.moveTo(clip[0].x,clip[0].y);c.lineTo(clip[1].x,clip[1].y);c.lineTo(clip[2].x,clip[2].y);c.closePath();c.clip();
        c.transform(a,b,cc,e,d[0].x-a*s[0].x-cc*s[0].y,d[0].y-b*s[0].x-e*s[0].y);c.drawImage(texture,0,0);c.restore();
      }
    }
  }
}

// Draw both fighters directly on a shared GPU layer. Avoid copying a WebGL
// surface back into a 2D canvas for every fighter on every frame.
export class CharacterLayer {
  constructor(mainCanvas){
    this.canvas=document.createElement('canvas');this.canvas.className='character-layer';this.canvas.setAttribute('aria-hidden','true');
    this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true});
    if(this.gl){mainCanvas.before(this.canvas);this.resize(mainCanvas.width,mainCanvas.height);}
  }
  resize(width,height){if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;this.gl.viewport(0,0,width,height);}
  clear(){this.gl.clearColor(0,0,0,0);this.gl.clear(this.gl.COLOR_BUFFER_BIT);}
  draw(skin,pose,m,opacity=1){
    const w=this.canvas.width,h=this.canvas.height;
    skin.drawGPU(pose,new Float32Array([m.a*2/w,-m.b*2/h,0,m.c*2/w,-m.d*2/h,0,m.e*2/w-1,1-m.f*2/h,1]),opacity);
  }
}
