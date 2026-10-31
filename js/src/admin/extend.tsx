import Extend from 'flarum/common/extenders';
import AvocadoSettingsPanel from './components/AvocadoSettingsPanel';

export default [
  // Um único item no registro: o painel desenha as abas e os cards do grupo ativo.
  new Extend.Admin().customSetting(() => m(AvocadoSettingsPanel), 100),
];
