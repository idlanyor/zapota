export const parseCommandInput = (body, prefix) => {
    const commandBody = body.trim().slice(prefix.length).trim();
    const [name = '', ...args] = commandBody.split(/\s+/);
    return { name: name.toLowerCase(), args, text: args.join(' ') };
};
