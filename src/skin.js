import { createSkinMesh, boneMatrices, skinVertex } from './rig.js';

export const SKIN_SURFACE = { width:800,height:720,x:400,y:640 };
export class OriginalSkin {
  constructor(image,id,{forceCanvas=false}={}) {
    this.image=image;this.id=id;this.canvas=document.createElement('canvas');
    this.canvas.width=SKIN_SURFACE.width;this.canvas.height=SKIN_SURFACE.height;
    this.gl=forceCanvas?null:this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
    this.meshes=Array.from({length:8},(_,frame)=>createSkinMesh(id,frame,this.gl?56:24));
    if(this.gl)this.initializeGL();
    else{this.canvas=document.createElement('canvas');this.canvas.width=SKIN_SURFACE.width;this.canvas.height=SKIN_SURFACE.height;this.ctx=this.canvas.getContext('2d');}
  }
  initializeGL(){
    const gl=this.gl;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    const vertex=compile(gl.VERTEX_SHADER,`attribute vec2 aPosition;attribute vec2 aUV;attribute vec4 aBones;attribute vec4 aWeights;uniform mat3 uBones[14];varying vec2 vUV;void main(){vec3 p=vec3(aPosition,1.0);vec3 q=(uBones[int(aBones.x)]*p)*aWeights.x+(uBones[int(aBones.y)]*p)*aWeights.y+(uBones[int(aBones.z)]*p)*aWeights.z+(uBones[int(aBones.w)]*p)*aWeights.w;gl_Position=vec4((q.x+400.0)/400.0-1.0,1.0-(q.y+640.0)/360.0,0.0,1.0);vUV=aUV;}`);
    const fragment=compile(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D uImage;uniform float uOpacity;varying vec2 vUV;void main(){gl_FragColor=texture2D(uImage,vUV)*uOpacity;}`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);this.program=program;
    this.attributes=['aPosition','aUV','aBones','aWeights'].map(x=>gl.getAttribLocation(program,x));
    this.boneUniform=gl.getUniformLocation(program,'uBones[0]');this.opacityUniform=gl.getUniformLocation(program,'uOpacity');
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.buffers=this.meshes.map(mesh=>{const v=gl.createBuffer(),i=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);return {v,i,count:mesh.indices.length};});
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.viewport(0,0,800,720);
  }
  render(pose){
    if(this.gl){
      const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
      for(const {frame,weight} of [{frame:pose.attachment??pose.frames[0].frame,weight:1}]){
        if(weight<.0001)continue;
        const matrices=boneMatrices(this.id,frame,pose.joints),uniforms=new Float32Array(matrices.flatMap(m=>[m[0],m[1],0,m[2],m[3],0,m[4],m[5],1]));
        gl.uniformMatrix3fv(this.boneUniform,false,uniforms);gl.uniform1f(this.opacityUniform,weight);
        const buffer=this.buffers[frame];gl.bindBuffer(gl.ARRAY_BUFFER,buffer.v);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer.i);
        [2,2,4,4].forEach((size,i)=>{gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],size,gl.FLOAT,false,48,[0,8,16,32][i]);});
        gl.drawElements(gl.TRIANGLES,buffer.count,gl.UNSIGNED_SHORT,0);
      }
    }else this.renderCanvas(pose);
    return pose;
  }
  renderCanvas(pose){
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,800,720);c.globalCompositeOperation='lighter';
    for(const {frame,weight} of [{frame:pose.attachment??pose.frames[0].frame,weight:1}]){
      const mesh=this.meshes[frame],matrices=boneMatrices(this.id,frame,pose.joints),v=mesh.vertices;
      const mapped=Array.from({length:v.length/12},(_,i)=>{const k=i*12;return skinVertex(v[k],v[k+1],[...v.slice(k+4,k+8)],[...v.slice(k+8,k+12)],matrices);});
      c.globalAlpha=weight;
      for(let i=0;i<mesh.indices.length;i+=3){
        const ids=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]],s=ids.map(n=>({x:v[n*12],y:v[n*12+1]})),d=ids.map(n=>({x:mapped[n].x+400,y:mapped[n].y+640}));
        const sx1=s[1].x-s[0].x,sy1=s[1].y-s[0].y,sx2=s[2].x-s[0].x,sy2=s[2].y-s[0].y,det=sx1*sy2-sx2*sy1;
        const dx1=d[1].x-d[0].x,dy1=d[1].y-d[0].y,dx2=d[2].x-d[0].x,dy2=d[2].y-d[0].y;
        const a=(dx1*sy2-dx2*sy1)/det,b=(dy1*sy2-dy2*sy1)/det,cc=(dx2*sx1-dx1*sx2)/det,e=(dy2*sx1-dy1*sx2)/det;
        c.save();c.beginPath();c.moveTo(d[0].x,d[0].y);c.lineTo(d[1].x,d[1].y);c.lineTo(d[2].x,d[2].y);c.closePath();c.clip();
        c.transform(a,b,cc,e,d[0].x-a*s[0].x-cc*s[0].y,d[0].y-b*s[0].x-e*s[0].y);
        c.drawImage(this.image,frame%4*this.image.width/4,Math.floor(frame/4)*this.image.height/2,this.image.width/4,this.image.height/2,0,0,448,448);c.restore();
      }
    }
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }
}
