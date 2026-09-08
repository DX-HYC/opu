'use strict';

/**
 * 生成「知识产权与著作权声明」(NOTICE)
 *
 * 设计目标（用户要求）：作品可免费开源、可免费给他人使用，
 * 但不得让别人移除 / 篡改 / 伪造著作权信息，也不得冒名。
 *
 * 法律要点：
 *  - 著作权自创作完成即自动归属作者，开源许可证只"授权使用"，不转移著作权；
 *  - 许可证（MIT/Apache 等）已要求保留版权声明，本声明进一步强化"禁止篡改/冒名"。
 */

function buildNotice(ctx) {
  const holder = (ctx && ctx.holder && String(ctx.holder).trim()) || '版权所有人';
  const year = (ctx && ctx.year) || new Date().getFullYear();
  const license = (ctx && ctx.license) || 'MIT';
  const email = ctx && ctx.email ? ` <${ctx.email}>` : '';
  const aliases = [];
  if (ctx && ctx.aliases) {
    (Array.isArray(ctx.aliases) ? ctx.aliases : [ctx.aliases]).forEach((a) => {
      if (a && String(a).trim()) aliases.push(String(a).trim());
    });
  }
  const aliasLine = aliases.length ? `\n（亦可表述为：${aliases.join(' / ')}）` : '';

  return `知识产权与著作权声明 / Intellectual Property & Copyright Notice
================================================================

Copyright © ${year} ${holder}${email}${aliasLine}
保留所有权利 / All rights reserved.


一、著作权归属
本作品（包括但不限于全部源代码、文档、示例及附随资料，以下统称"本作品"）的著作权
归 ${holder} 所有。依据《中华人民共和国著作权法》及国际著作权条约，作品自创作完成之日起
即自动享有著作权。本声明与同目录 LICENSE 文件中的开源许可证均不转移著作权，
仅向使用方授予有限的使用许可。


二、开源授权
本作品以 ${license} 许可证免费开源。任何人可免费使用、复制、修改、合并、发布、分发本作品，
包括但不限于商业用途，无需支付任何费用。


三、署名与著作权声明保留（重要）
任何对本作品的使用、复制、修改、分发行为，均须同时满足：
  1. 保留本知识产权声明（NOTICE）；
  2. 保留 LICENSE 文件中的原始版权声明与许可声明；
  3. 不得移除、篡改、隐匿或伪造上述任何著作权信息。


四、修改标注
若对本作品进行修改并再行分发，须在相关文件中以显著方式标注"已修改（modified）"及修改内容，
且不得不当致使他人误认为未修改的原作。


五、禁止冒名与背书
未经 ${holder} 事先书面许可，任何人不得：
  1. 宣称自己为本作品的原始作者；
  2. 使用 ${holder} 或本作品名称进行任何形式的宣传、推广或背书。


六、免责声明
本作品按"现状（AS IS）"提供，不提供任何明示或默示担保，作者不承担因使用本作品产生的任何责任。


----------------------------------------------------------------
附：本作品所采用开源许可证（${license}）全文见同目录 LICENSE 文件。
本声明与 LICENSE 冲突时，以 LICENSE 为准；但任何条款均不得解释为允许
移除或篡改本声明及原始著作权署名。
`;
}

module.exports = { buildNotice };
