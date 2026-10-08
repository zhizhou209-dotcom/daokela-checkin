# 到课啦：课堂定位签到

这是可部署到 Cloudflare Workers 的完整版本，包含网页、服务器端定位校验和共享签到名单（D1）。学生使用同一个 HTTPS 链接签到，教师使用管理密码查看、导出和清空名单。

## 部署准备

需要一个 Cloudflare 账号，并在本机安装 Node.js/npm。请在项目根目录（本 README 所在目录）打开终端。

### GitHub 自动部署到已有 Worker

如需从 GitHub 自动部署到已经创建的 `daokela-checkin` Worker：

1. 将本目录中的项目文件上传到 GitHub 仓库，建议将仓库设为私有。
2. 在 Cloudflare 控制台打开 `daokela-checkin` Worker，进入 **Settings → Builds → Connect**，授权并选择该仓库。
3. 生产分支选 `main`，项目根目录留空或填 `.`；部署命令使用 `npx wrangler deploy`。
4. 保存后，向 `main` 推送提交即可触发 Cloudflare 构建并更新 Worker。

`wrangler.jsonc` 中的 Worker 名称和 D1 数据库绑定对应现有线上资源。请不要把管理密码、API Token、签到名单或数据库文件上传到 GitHub；管理密码应继续放在 Cloudflare 的 Worker Secret 中。连接仓库后，生产分支每次推送都会部署到线上。

```sh
npx wrangler login
npx wrangler d1 create daokela-checkin --location apac --update-config
npx wrangler d1 migrations apply daokela-checkin --remote
npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy
```

说明：

1. `wrangler login` 会打开 Cloudflare 授权页面；请由账号持有人自行登录并授权。
2. 创建数据库命令会把数据库 ID 写入 `wrangler.jsonc`。
3. 应用数据库结构后，设置 `ADMIN_PASSWORD`。终端会提示输入密钥；请在终端中输入，不要把密码发到聊天里。
4. 部署成功后，Wrangler 会显示可分享的 `https://…workers.dev` 网址。
5. 打开网址，点“教师设置”，输入管理密码，在教室点击“使用当前位置”，填写课堂名称和范围并保存。随后把同一个网址发给学生。

如果账户还没有启用 `workers.dev` 子域名，按 Cloudflare 页面提示先启用，再重新部署。

## 签到数据

D1 会保存课堂名称、课堂定位点、签到半径和开放状态，以及学生姓名、学号、签到时间和取整后的距离。学生点击签到时，浏览器坐标会通过 HTTPS 发给 Worker 做半径校验；本应用不把学生精确坐标写入数据库。

教师管理密码作为 Cloudflare Worker Secret 保存。学生名单和教师操作接口需要该密码；教师页面关闭或刷新后，需要重新输入。
