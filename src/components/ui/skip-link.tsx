type SkipLinkProps = {
  targetId: string;
  label?: string;
};

export function SkipLink({
  targetId,
  label = "Skip to main content",
}: SkipLinkProps) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      {label}
    </a>
  );
}
