// Some restricted Windows runtimes fail os.userInfo() with ENOMEM. tsx only
// needs a stable identifier to construct its temporary directory, so provide
// the POSIX-style hook it checks before falling back to os.userInfo().
if (typeof process.geteuid !== "function") {
  process.geteuid = () => "kestrel";
}
