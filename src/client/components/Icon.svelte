<script lang="ts" module>
  const paths = {
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    arrowUp: 'M12 19V5M6 11l6-6 6 6',
    arrowDown: 'M12 5v14M18 13l-6 6-6-6',
    arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M9.5 8.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
    sigma: 'M17 5H7l6 7-6 7h10',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
    grip: 'M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01',
    shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M16 4l4 3-4 3M16 14l4 3-4 3M13 9.5C14 8 15 7 17 7h3',
  } as const;

  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={name === 'grip' ? 3.2 : 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>
