'use strict';

/**
 * 精简版 LICENSE 文本（含可配置的著作权人，对国际化项目足够常用）
 * getLicenseText(key, ctx) —— ctx: { holder, year }
 */

function yearOf(ctx) {
  return (ctx && ctx.year) || new Date().getFullYear();
}
function holderOf(ctx) {
  return (ctx && ctx.holder && String(ctx.holder).trim()) || '版权所有人';
}

const TEXTS = {
  'MIT': (ctx) => `MIT License

Copyright (c) ${yearOf(ctx)} ${holderOf(ctx)}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`,
  'Apache-2.0': (ctx) => `Apache License, Version 2.0
Copyright (c) ${yearOf(ctx)} ${holderOf(ctx)}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
`,
  'GPL-3.0': (ctx) => `GNU GENERAL PUBLIC LICENSE Version 3
Copyright (c) ${yearOf(ctx)} ${holderOf(ctx)}
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation.
`,
  'BSD-3-Clause': (ctx) => `BSD 3-Clause License
Copyright (c) ${yearOf(ctx)} ${holderOf(ctx)}
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met.
`,
  'MPL-2.0': (ctx) => `Mozilla Public License, v. 2.0
Copyright (c) ${yearOf(ctx)} ${holderOf(ctx)}
This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
`,
  'Unlicense': () => `This is free and unencumbered software released into the public domain.
`,
};

module.exports = function getLicenseText(key, ctx) {
  const entry = TEXTS[key] || TEXTS['MIT'];
  return typeof entry === 'function' ? entry(ctx || {}) : entry;
};
