export default async function handler(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  console.log("TAOBAO_CB", {
    method: req.method,
    headers: req.headers,
    body: body.slice(0, 2000)
  });
  res.status(200).send("ok");
}
