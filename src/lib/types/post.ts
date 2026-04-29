export interface Post {
	id: string;
	user: {
		name: string;
		icon: string;
	};
	content: string;
	hashtags: string[];
	postedAt: Date;
	relatedAnime: {
		id: string;
		title: string;
	};
	likes: number;
	reposts: number;
	liked: boolean;
	reposted: boolean;
}
