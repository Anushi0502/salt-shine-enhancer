package com.saltonlinestore.saltstoreandroid.ui.home;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;

public class HomeBannerAdapter extends RecyclerView.Adapter<HomeBannerAdapter.BannerViewHolder> {
    public interface OnBannerClickListener {
        void onBannerClick(HomeFeedSection.BannerItem item);
    }

    private final List<HomeFeedSection.BannerItem> items = new ArrayList<>();
    private final OnBannerClickListener listener;

    public HomeBannerAdapter(OnBannerClickListener listener) {
        this.listener = listener;
    }

    public void submit(List<HomeFeedSection.BannerItem> banners) {
        items.clear();
        if (banners != null) {
            items.addAll(banners);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public BannerViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_home_banner_card, parent, false);
        return new BannerViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull BannerViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class BannerViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView title;
        private final TextView subtitle;
        private final TextView cta;
        private final TextView badge;

        BannerViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.home_banner_image);
            title = itemView.findViewById(R.id.home_banner_title);
            subtitle = itemView.findViewById(R.id.home_banner_subtitle);
            cta = itemView.findViewById(R.id.home_banner_cta);
            badge = itemView.findViewById(R.id.home_banner_badge);
        }

        void bind(HomeFeedSection.BannerItem item) {
            title.setText(item.title);
            subtitle.setText(item.subtitle);
            cta.setText(item.ctaLabel);
            badge.setText("Live");

            if (item.imageUrl == null || item.imageUrl.trim().isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(item.imageUrl).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onBannerClick(item);
                }
            });
        }
    }
}
