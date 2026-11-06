import {Composition,Folder,Series,useVideoConfig} from 'remotion';
import {Data} from './Data';
import {Limits} from './Limits';
import {Journey} from './Journey';
import {Cache} from './Cache';
import {Optimize} from './Optimize';
import {Scenarios} from './Scenarios';
import {Finish} from './Finish';
const Lesson=()=>{const {fps}=useVideoConfig();return <Series>
<Series.Sequence name="01 · Where data lives" durationInFrames={40*fps} premountFor={fps}><Data/></Series.Sequence>
<Series.Sequence name="02 · What counts" durationInFrames={60*fps} premountFor={fps}><Limits/></Series.Sequence>
<Series.Sequence name="03 · Buko order" durationInFrames={50*fps} premountFor={fps}><Journey/></Series.Sequence>
<Series.Sequence name="04 · Follow the bytes" durationInFrames={30*fps} premountFor={fps}><Cache/></Series.Sequence>
<Series.Sequence name="05 · Optimize" durationInFrames={40*fps} premountFor={fps}><Optimize/></Series.Sequence>
<Series.Sequence name="06 · Traffic scenarios" durationInFrames={45*fps} premountFor={fps}><Scenarios/></Series.Sequence>
<Series.Sequence name="07 · Decide with measurements" durationInFrames={35*fps} premountFor={fps}><Finish/></Series.Sequence>
</Series>;};
export const RemotionRoot=()=> <>
<Composition id="Makalipie-Supabase" component={Lesson} width={1920} height={1080} fps={30} durationInFrames={9000}/>
<Folder name="Chapters">
<Composition id="01-Data" component={Data} width={1920} height={1080} fps={30} durationInFrames={1200}/>
<Composition id="02-Limits" component={Limits} width={1920} height={1080} fps={30} durationInFrames={1800}/>
<Composition id="03-Journey" component={Journey} width={1920} height={1080} fps={30} durationInFrames={1500}/>
<Composition id="04-Cache" component={Cache} width={1920} height={1080} fps={30} durationInFrames={900}/>
<Composition id="05-Optimize" component={Optimize} width={1920} height={1080} fps={30} durationInFrames={1200}/>
<Composition id="06-Scenarios" component={Scenarios} width={1920} height={1080} fps={30} durationInFrames={1350}/>
<Composition id="07-Decision" component={Finish} width={1920} height={1080} fps={30} durationInFrames={1050}/>
</Folder></>;
